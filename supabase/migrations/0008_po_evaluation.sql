-- Phase 3: Purchase Officer evaluation -- inspection confirmation + Nippon's
-- offer. One evaluation per case, ever (case_id is UNIQUE, no update/delete
-- policy for anyone -- immutability by omission, same pattern as case_offers
-- in the original plan).

create table case_offers (
  id uuid primary key default gen_random_uuid(),
  case_id uuid unique not null references cases (id),
  purchase_officer_id uuid not null references profiles (id),
  inspection_completed boolean not null,
  inspection_notes text,
  offer_price numeric(12, 2) not null check (offer_price > 0),
  submitted_at timestamptz not null default now()
);

alter table case_offers enable row level security;

create policy case_offers_select on case_offers
  for select to authenticated
  using (
    exists (
      select 1 from cases c
      where c.id = case_offers.case_id
        and (
          (current_profile_role() = 'sales_officer' and c.sales_officer_id = auth.uid())
          or (current_profile_role() = 'purchase_officer' and c.assigned_po_id = auth.uid())
          or (current_profile_role() = 'manager' and (current_profile_is_group_manager() or c.branch_id = current_profile_branch()))
        )
    )
  );
-- No insert/update/delete policy: only submit_po_evaluation() (security definer) writes here.

-- =========================================================================
-- submit_po_evaluation: pending_evaluation -> pending_customer_decision
-- =========================================================================
create or replace function submit_po_evaluation(
  p_case_id uuid,
  p_inspection_completed boolean,
  p_inspection_notes text,
  p_offer_price numeric
)
returns cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case cases;
begin
  select * into v_case from cases where id = p_case_id for update;

  if v_case is null then
    raise exception 'Case not found';
  end if;

  if v_case.assigned_po_id != auth.uid() then
    raise exception 'Not authorized to evaluate this case';
  end if;

  if v_case.status != 'pending_evaluation' then
    raise exception 'Case is not awaiting evaluation';
  end if;

  if p_inspection_completed is distinct from true then
    raise exception 'Physical inspection must be confirmed before submitting';
  end if;

  if p_offer_price is null or p_offer_price <= 0 then
    raise exception 'Offer price must be greater than zero';
  end if;

  -- Unique index on case_offers.case_id makes a second submission impossible;
  -- this insert simply fails if one already exists.
  insert into case_offers (case_id, purchase_officer_id, inspection_completed, inspection_notes, offer_price)
  values (p_case_id, auth.uid(), p_inspection_completed, p_inspection_notes, p_offer_price);

  update cases
  set status = 'pending_customer_decision'
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role, metadata)
  values (p_case_id, 'evaluation_submitted', auth.uid(), 'purchase_officer', jsonb_build_object('offer_price', p_offer_price));

  return v_case;
end;
$$;

revoke execute on function submit_po_evaluation(uuid, boolean, text, numeric) from public, anon;
grant execute on function submit_po_evaluation(uuid, boolean, text, numeric) to authenticated;
