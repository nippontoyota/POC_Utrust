-- Bug: record_customer_decision() picked the chronologically LAST
-- case_negotiations round as the accepted final_price, regardless of which
-- side made it. If the customer's latest counter was still unanswered (no
-- matching nippon_revised round after it) and the PO recorded "Customer
-- Accepted" anyway, the system recorded the customer's own unaccepted ask
-- as the price -- not anything Nippon actually offered.
--
-- Fix: final_price is always Nippon's side of the negotiation -- the latest
-- nippon_revised round, or the original case_offers.offer_price if Nippon
-- never revised. A customer_counter round is never itself an acceptable
-- price; if the PO wants to honor it, the existing workflow already
-- requires logging a matching nippon_revised round first.
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
    where case_id = p_case_id and direction = 'nippon_revised'
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
