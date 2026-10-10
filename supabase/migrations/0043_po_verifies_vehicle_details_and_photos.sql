-- The SO's submission is only a starting point flagging that a case exists --
-- the PO verifies/corrects every vehicle field against the car and the
-- customer, and takes the required photos themselves if the SO didn't.
--
-- 1. SO's photo upload becomes fully optional again (undoes 0041's 5-angle
--    requirement at SO-submission time).
-- 2. The PO can now upload/delete case_photos (and the matching storage
--    objects) while a case is pending_evaluation, in addition to the
--    existing listed_for_brokers window from 0039.
-- 3. submit_po_evaluation() now takes the full vehicle field set (make,
--    model, variant, colour, fuel type, transmission, odometer, loan status)
--    on top of the existing model year / ownership count, validates all of
--    them, requires the 5 standard angle photos to exist, and writes
--    everything onto the case before recording the offer.

-- =========================================================================
-- 1. SO submission: drop the 5-angle-photo requirement (back to optional).
-- =========================================================================
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

-- =========================================================================
-- 2. PO photo management during pending_evaluation (in addition to the
--    existing listed_for_brokers window from 0039). No enum/type change
--    here, so these policies can just be created directly.
-- =========================================================================
create policy case_photos_insert_po_eval on case_photos for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from cases c
      where c.id = case_photos.case_id
        and c.assigned_po_id = auth.uid()
        and c.status = 'pending_evaluation'
    )
  );

create policy case_photos_delete_po_eval on case_photos for delete to authenticated
  using (
    exists (
      select 1 from cases c
      where c.id = case_photos.case_id
        and c.assigned_po_id = auth.uid()
        and c.status = 'pending_evaluation'
    )
  );

create policy vehicle_photos_insert_po_eval on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and exists (
      select 1 from cases c
      where c.id::text = (storage.foldername(name))[1]
        and c.assigned_po_id = auth.uid()
        and c.status = 'pending_evaluation'
    )
  );

create policy vehicle_photos_delete_po_eval on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and exists (
      select 1 from cases c
      where c.id::text = (storage.foldername(name))[1]
        and c.assigned_po_id = auth.uid()
        and c.status = 'pending_evaluation'
    )
  );

-- =========================================================================
-- 3. submit_po_evaluation: full vehicle field set + 5-angle photo check.
-- =========================================================================
create or replace function submit_po_evaluation(
  p_case_id uuid,
  p_inspection_completed boolean,
  p_inspection_notes text,
  p_offer_price numeric,
  p_make text,
  p_model text,
  p_variant text,
  p_color text,
  p_registration_year int,
  p_fuel_type fuel_type,
  p_transmission transmission_type,
  p_odometer_km int,
  p_ownership_count int,
  p_has_loan boolean,
  p_lender_note text
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

  if p_make is null or length(trim(p_make)) = 0 then
    raise exception 'Make is required';
  end if;

  if p_model is null or length(trim(p_model)) = 0 then
    raise exception 'Model is required';
  end if;

  if p_fuel_type is null then
    raise exception 'Fuel type is required';
  end if;

  if p_transmission is null then
    raise exception 'Transmission is required';
  end if;

  if p_odometer_km is null or p_odometer_km < 0 or p_odometer_km > 999999 then
    raise exception 'A valid odometer reading is required';
  end if;

  if p_has_loan is null then
    raise exception 'Loan / hypothecation status is required';
  end if;

  if p_registration_year is null or p_registration_year < 1980 or p_registration_year > extract(year from now()) then
    raise exception 'A valid year of manufacture is required';
  end if;

  if p_ownership_count is null or p_ownership_count < 1 or p_ownership_count > 10 then
    raise exception 'A valid ownership count is required';
  end if;

  if (
    select count(distinct category) from case_photos
    where case_id = p_case_id and category in ('front', 'rear', 'left', 'right', 'interior_odometer')
  ) < 5 then
    raise exception 'All 5 required angle photos (front, rear, left, right, interior/odometer) are required';
  end if;

  update cases
  set make = trim(p_make),
      model = trim(p_model),
      variant = nullif(trim(coalesce(p_variant, '')), ''),
      color = nullif(trim(coalesce(p_color, '')), ''),
      registration_year = p_registration_year,
      fuel_type = p_fuel_type,
      transmission = p_transmission,
      odometer_km = p_odometer_km,
      ownership_count = p_ownership_count,
      has_loan = p_has_loan,
      lender_note = nullif(trim(coalesce(p_lender_note, '')), '')
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

drop function if exists submit_po_evaluation(uuid, boolean, text, numeric, int, int);
revoke execute on function submit_po_evaluation(uuid, boolean, text, numeric, text, text, text, text, int, fuel_type, transmission_type, int, int, boolean, text) from public, anon;
grant execute on function submit_po_evaluation(uuid, boolean, text, numeric, text, text, text, text, int, fuel_type, transmission_type, int, int, boolean, text) to authenticated;
