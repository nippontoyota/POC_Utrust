-- Bug: once a PO records a "Nippon Revised" negotiation round and the
-- customer then accepts, every display of "the accepted price" (the PO's
-- own headline while deciding, the manager/coordinator case detail pages,
-- and the manager dashboard's closed-deal-value total) kept showing
-- case_offers.offer_price -- the frozen original evaluation amount -- since
-- nothing captured what the customer actually agreed to. case_negotiations
-- already records every round, but there was no single persisted "this is
-- the final price" field for downstream views (especially server-side
-- aggregates) to read.
--
-- Fix: add cases.final_price, set by record_customer_decision() at the
-- moment of acceptance to the latest negotiation round's amount, or the
-- original offer price if no negotiation ever happened.

alter table cases add column if not exists final_price numeric(12, 2)
  check (final_price is null or final_price > 0);

create or replace function record_customer_decision(
  p_case_id uuid,
  p_decision customer_decision_type,
  p_broker_consent boolean default null
)
returns cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case cases;
  v_new_status case_status;
  v_final_price numeric(12, 2);
begin
  select * into v_case from cases where id = p_case_id for update;

  if v_case is null then
    raise exception 'Case not found';
  end if;

  if v_case.assigned_po_id is distinct from auth.uid() then
    raise exception 'Only the assigned Purchase Officer can record the customer decision';
  end if;

  if v_case.status != 'pending_customer_decision' then
    raise exception 'Case is not awaiting a customer decision';
  end if;

  if p_decision = 'accepted' then
    v_new_status := 'purchase_completion_pending';

    select amount into v_final_price
    from case_negotiations
    where case_id = p_case_id
    order by round desc
    limit 1;

    if v_final_price is null then
      select offer_price into v_final_price from case_offers where case_id = p_case_id;
    end if;
  else
    v_new_status := case when p_broker_consent is true then 'listed_for_brokers' else 'rejected_not_listed' end;
  end if;

  update cases
  set customer_decision = p_decision,
      customer_decision_at = now(),
      customer_decision_by = auth.uid(),
      broker_consent = case when p_decision = 'rejected' then p_broker_consent else null end,
      broker_consent_at = case when p_decision = 'rejected' and p_broker_consent is not null then now() else null end,
      listed_at = case when v_new_status = 'listed_for_brokers' then now() else null end,
      final_price = case when p_decision = 'accepted' then v_final_price else final_price end,
      status = v_new_status
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role, metadata)
  values (
    p_case_id,
    'customer_decision_recorded',
    auth.uid(),
    'purchase_officer',
    jsonb_build_object('decision', p_decision, 'broker_consent', p_broker_consent, 'final_price', v_final_price)
  );

  if v_new_status = 'listed_for_brokers' then
    insert into case_events (case_id, event_type, actor_id, actor_role)
    values (p_case_id, 'listed_for_brokers', auth.uid(), 'purchase_officer');
  end if;

  return v_case;
end;
$$;

-- po_manager_cases(): the list's "Offer Price" column should reflect the
-- final accepted price once one has been recorded, not the frozen original.
create or replace function po_manager_cases(p_search text default '', p_branch uuid default null, p_status text default null, p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'po_manager' and is_active) then
    raise exception 'Active PO Manager required';
  end if;
  with scoped as (
    select c.*, b.name branch_name, p.full_name po_name, p.employee_id po_employee_id,
      coalesce(c.final_price, o.offer_price) offer_price, o.submitted_at offer_submitted_at
    from cases c
    join branches b on b.id = c.branch_id
    left join profiles p on p.id = c.assigned_po_id
    left join case_offers o on o.case_id = c.id
    where c.assigned_po_id is not null
      and (p_branch is null or c.branch_id = p_branch)
      and (p_status is null or c.status::text = p_status)
      and concat_ws(' ', c.case_ref, c.make, c.model, c.vehicle_reg_number) ilike '%' || left(coalesce(p_search, ''), 100) || '%'
  ), paged as (
    select * from scoped order by submitted_at desc nulls last, id limit 20 offset greatest(0, least(10000, coalesce(p_page, 0))) * 20
  )
  select jsonb_build_object(
    'total', (select count(*) from scoped),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'case_ref', s.case_ref, 'branch_name', s.branch_name, 'po_name', s.po_name, 'po_employee_id', s.po_employee_id,
      'make', s.make, 'model', s.model, 'variant', s.variant, 'status', s.status,
      'offer_price', s.offer_price, 'submitted_at', s.submitted_at, 'evaluation_started_at', s.evaluation_started_at
    )), '[]')
  ) into result from paged s;
  return result;
end $$;
