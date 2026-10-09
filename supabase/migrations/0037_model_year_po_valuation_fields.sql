-- Model year (registration_year) and ownership count are important for
-- valuation but often unknown to the SO in the field -- make both optional
-- at SO submission time, and require the PO to verify/fill them in (along
-- with the rest of the evaluation) before an offer can be submitted. The
-- column name stays registration_year; only the label changed in the UI.

create or replace function submit_case_for_evaluation(p_case_id uuid)
returns cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case cases;
  v_branch_code text;
  v_yyyymm text;
  v_seq int;
  v_po_id uuid;
begin
  select * into v_case from cases where id = p_case_id for update;

  if v_case is null then
    raise exception 'Case not found';
  end if;

  if v_case.sales_officer_id != auth.uid() then
    raise exception 'Not authorized to submit this case';
  end if;

  if v_case.status != 'draft' then
    raise exception 'Case is not in draft status';
  end if;

  if v_case.customer_name is null or v_case.customer_mobile is null
     or v_case.vehicle_reg_number is null or v_case.make is null
     or v_case.model is null
     or v_case.fuel_type is null
     or v_case.transmission is null or v_case.odometer_km is null
     or v_case.has_loan is null then
    raise exception 'Case is missing required fields';
  end if;

  if (select count(*) from case_photos where case_id = p_case_id) < 6 then
    raise exception 'At least 6 photos are required';
  end if;

  select code into v_branch_code from branches where id = v_case.branch_id;
  v_yyyymm := to_char(now(), 'YYYYMM');

  insert into case_ref_counters (branch_id, yyyymm, next_seq)
  values (v_case.branch_id, v_yyyymm, 2)
  on conflict (branch_id, yyyymm) do update set next_seq = case_ref_counters.next_seq + 1
  returning next_seq - 1 into v_seq;

  -- Round-robin PO assignment: the active PO in this branch least recently assigned.
  select id into v_po_id
  from profiles
  where role = 'purchase_officer' and branch_id = v_case.branch_id and is_active = true
  order by last_assigned_at nulls first
  for update skip locked
  limit 1;

  if v_po_id is null then
    raise exception 'No active Purchase Officer available in this branch';
  end if;

  update profiles set last_assigned_at = now() where id = v_po_id;

  update cases
  set status = 'pending_evaluation',
      case_ref = 'UT-' || v_branch_code || '-' || v_yyyymm || '-' || lpad(v_seq::text, 4, '0'),
      assigned_po_id = v_po_id,
      submitted_at = now()
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role, metadata)
  values (p_case_id, 'submitted_for_evaluation', auth.uid(), 'sales_officer', jsonb_build_object('assigned_po_id', v_po_id));

  return v_case;
end;
$$;

-- submit_po_evaluation now also takes and requires model year + ownership
-- count, verifying/filling in whatever the SO left blank (or correcting it)
-- as part of the same evaluation submission, since both matter for valuation.
create or replace function submit_po_evaluation(
  p_case_id uuid,
  p_inspection_completed boolean,
  p_inspection_notes text,
  p_offer_price numeric,
  p_registration_year int,
  p_ownership_count int
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

  if p_registration_year is null or p_registration_year < 1980 or p_registration_year > extract(year from now()) then
    raise exception 'A valid model year is required';
  end if;

  if p_ownership_count is null or p_ownership_count < 1 or p_ownership_count > 10 then
    raise exception 'A valid ownership count is required';
  end if;

  update cases
  set registration_year = p_registration_year,
      ownership_count = p_ownership_count
  where id = p_case_id;

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

drop function if exists submit_po_evaluation(uuid, boolean, text, numeric);
revoke execute on function submit_po_evaluation(uuid, boolean, text, numeric, int, int) from public, anon;
grant execute on function submit_po_evaluation(uuid, boolean, text, numeric, int, int) to authenticated;
