-- Restore the Sales Officer role and the SO (intake) -> PO (round-robin
-- evaluation) -> SO (customer decision) handoff, reverting 0031-0033.
-- Function/policy bodies below are taken verbatim from their last pre-0031
-- definition (0016 submit_case_for_evaluation, 0029 record_customer_decision,
-- 0012 start_po_evaluation/require_evaluation_started, 0008 case_offers/
-- submit_po_evaluation, 0019 po_manager_*, 0013 so_broker_summary, 0028
-- manager_case_access) except where noted. Three things are deliberately
-- NOT reverted (kept from the intervening work): automatic broker-photo
-- visibility (case_photos_auto_broker_visible trigger, untouched here),
-- the single undifferentiated broker reference price in broker_marketplace()
-- (untouched here), and Broker Coordinator staying out of photo review and
-- the listing gate (broker_case_action is untouched here).

-- =========================================================================
-- 1. Drop everything that references po_id/so_name directly (not just via
--    current_profile_role()) before the columns they depend on change.
-- =========================================================================
drop policy if exists cases_select on cases;
drop policy if exists cases_insert_po on cases;
drop policy if exists cases_update_po on cases;
drop policy if exists cases_delete_po_draft on cases;
drop policy if exists case_photos_insert_po on case_photos;
drop policy if exists case_photos_delete_po on case_photos;
drop policy if exists vehicle_photos_insert_po on storage.objects;
drop policy if exists vehicle_photos_delete_po on storage.objects;
drop policy if exists profiles_insert_self_staff on profiles;
alter table profiles drop constraint if exists profiles_role_scope_check;
drop function if exists submit_case(uuid);
drop function if exists po_broker_summary();

-- =========================================================================
-- 2. cases: split po_id back into sales_officer_id (case owner) and
--    assigned_po_id (round-robin evaluator); so_name goes away since a real
--    SO account replaces the free-text note; evaluation_started_at returns.
-- =========================================================================
alter table cases rename column po_id to sales_officer_id;
alter table cases rename constraint cases_po_id_fkey to cases_sales_officer_id_fkey;
alter table cases add column assigned_po_id uuid references profiles(id);
alter table cases add column evaluation_started_at timestamptz;
alter table cases drop column so_name;

alter table profiles add column last_assigned_at timestamptz;

-- =========================================================================
-- 3. case_offers: PO's one-time inspection confirmation + Nippon's offer,
--    append-only (no update/delete policy for anyone).
-- =========================================================================
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

-- current_profile_role() = 'manager' no longer exists (removed in 0024) --
-- delegate to manager_case_access() instead, same pattern already used for
-- case_photos_select/case_events_select.
create policy case_offers_select on case_offers
  for select to authenticated
  using (manager_case_access(case_id));

-- =========================================================================
-- 4. profiles: re-admit sales_officer to self-registration and the role/
--    scope CHECK.
-- =========================================================================
create policy profiles_insert_self_staff on profiles for insert to authenticated
  with check (
    id = auth.uid()
    and role = any (array['sales_officer'::app_role, 'purchase_officer'::app_role])
  );

alter table profiles add constraint profiles_role_scope_check check (
  case role
    when 'sales_officer' then (branch_id is not null and cluster_id is null)
    when 'purchase_officer' then (branch_id is not null and cluster_id is null)
    when 'sales_manager' then (branch_id is not null and cluster_id is null)
    when 'cluster_manager' then (branch_id is null and cluster_id is not null)
    when 'po_manager' then (branch_id is null and cluster_id is null)
    when 'admin' then (branch_id is null and cluster_id is null)
    when 'broker_coordinator' then (branch_id is null and cluster_id is null)
    else null
  end
);

-- =========================================================================
-- 5. cases policies: SO owns/edits drafts, PO only via assigned_po_id.
-- =========================================================================
create policy cases_insert_so on cases for insert to authenticated
  with check (
    current_profile_role() = 'sales_officer'
    and sales_officer_id = auth.uid()
    and branch_id = current_profile_branch()
    and status = 'draft'
  );

create policy cases_update_so_draft on cases for update to authenticated
  using (
    current_profile_role() = 'sales_officer'
    and sales_officer_id = auth.uid()
    and status = 'draft'
  )
  with check (
    current_profile_role() = 'sales_officer'
    and sales_officer_id = auth.uid()
    and status = 'draft'
  );

create policy cases_delete_so_draft on cases for delete to authenticated
  using (
    current_profile_role() = 'sales_officer'
    and sales_officer_id = auth.uid()
    and status = 'draft'
  );

create policy cases_select on cases for select to authenticated
  using (
    (current_profile_role() = 'sales_officer' and sales_officer_id = auth.uid())
    or (current_profile_role() = 'purchase_officer' and assigned_po_id = auth.uid())
    or manager_branch_access(branch_id)
    or (current_profile_role() = 'broker_coordinator' and broker_consent is true)
  );

-- =========================================================================
-- 6. manager_case_access: same split-owner swap, feeds case_photos/
--    case_events/case_offers/staff_broker_case for every manager-family role.
-- =========================================================================
create or replace function manager_case_access(p_case_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from cases c where c.id = p_case_id and (
      (current_profile_role() = 'sales_officer' and c.sales_officer_id = auth.uid())
      or (current_profile_role() = 'purchase_officer' and c.assigned_po_id = auth.uid())
      or manager_branch_access(c.branch_id)
      or (current_profile_role() = 'po_manager' and c.assigned_po_id is not null)
      or (current_profile_role() = 'broker_coordinator' and c.broker_consent is true)
    )
  )
$$;

-- =========================================================================
-- 7. case_photos / storage: SO owns upload/delete, draft-only (no PO photo
--    step -- all photos come in at SO intake, same as before 0031).
-- =========================================================================
create policy case_photos_insert_so on case_photos for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from cases c
      where c.id = case_photos.case_id
        and c.sales_officer_id = auth.uid()
        and c.status = 'draft'
    )
  );

create policy case_photos_delete_so on case_photos for delete to authenticated
  using (
    exists (
      select 1 from cases c
      where c.id = case_photos.case_id
        and c.sales_officer_id = auth.uid()
        and c.status = 'draft'
    )
  );

create policy vehicle_photos_insert_so on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and exists (
      select 1 from cases c
      where c.id::text = (storage.foldername(name))[1]
        and c.sales_officer_id = auth.uid()
        and c.status = 'draft'
    )
  );

create policy vehicle_photos_delete_so on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and exists (
      select 1 from cases c
      where c.id::text = (storage.foldername(name))[1]
        and c.sales_officer_id = auth.uid()
        and c.status = 'draft'
    )
  );

-- =========================================================================
-- 8. Column-level grants: cases locked to an explicit column list again --
--    sales_officer_id replaces po_id, nippon_offer_price/so_name are gone
--    (the offer is set only via submit_po_evaluation, security definer).
-- =========================================================================
revoke insert, update on cases from authenticated;
grant insert(branch_id, sales_officer_id, status) on cases to authenticated;
grant update(
  customer_name, customer_mobile, vehicle_reg_number, make, model, variant, color,
  registration_year, fuel_type, transmission, odometer_km, ownership_count,
  has_loan, lender_note, customer_expected_price
) on cases to authenticated;

-- =========================================================================
-- 9. RC book + 6-photo gate on the draft -> pending_evaluation transition.
-- =========================================================================
create function require_case_submission_photos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from case_photos where case_id=new.id and category='rc_book') then
    raise exception 'An RC book photo is required before submitting for evaluation';
  end if;
  if (select count(*) from case_photos where case_id=new.id and category<>'rc_book') < 6 then
    raise exception 'At least 6 vehicle photos are required in addition to the RC book photo';
  end if;
  return new;
end $$;
create trigger cases_require_rc_book_before_evaluation
  before update of status on cases for each row
  when (old.status='draft' and new.status='pending_evaluation')
  execute function require_case_submission_photos();
revoke all on function require_case_submission_photos() from public,anon,authenticated;

-- =========================================================================
-- 10. submit_case_for_evaluation: draft -> pending_evaluation. Validates
--     required fields, generates case_ref, round-robin assigns a PO.
-- =========================================================================
create function submit_case_for_evaluation(p_case_id uuid)
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
     or v_case.registration_year is null or v_case.fuel_type is null
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

revoke execute on function submit_case_for_evaluation(uuid) from public, anon;
grant execute on function submit_case_for_evaluation(uuid) to authenticated;

-- =========================================================================
-- 11. withdraw_case: draft/pending_evaluation/pending_customer_decision ->
--     withdrawn. SO's action again.
-- =========================================================================
create or replace function withdraw_case(p_case_id uuid, p_reason text)
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

  if v_case.sales_officer_id != auth.uid() then
    raise exception 'Not authorized to withdraw this case';
  end if;

  if v_case.status not in ('draft', 'pending_evaluation', 'pending_customer_decision') then
    raise exception 'Case cannot be withdrawn from its current status';
  end if;

  if p_reason is null or trim(both E' \t\n\r' from p_reason) = '' then
    raise exception 'A withdrawal reason is required';
  end if;

  update cases
  set status = 'withdrawn', withdrawn_at = now(), withdrawn_reason = p_reason
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role, notes)
  values (p_case_id, 'case_withdrawn', auth.uid(), 'sales_officer', p_reason);

  return v_case;
end;
$$;

-- =========================================================================
-- 12. PO evaluation: start_po_evaluation (confirms inspection has begun) ->
--     submit_po_evaluation (one-time offer, case_offers insert, guarded by
--     the evaluation_must_be_started trigger).
-- =========================================================================
create function start_po_evaluation(p_case_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c cases;
begin
  select * into c from cases where id=p_case_id for update;
  if auth.uid() is null or c.assigned_po_id is distinct from auth.uid() or not exists(select 1 from profiles where id=auth.uid() and role='purchase_officer' and is_active) then raise exception 'Assigned PO required'; end if;
  if c.status<>'pending_evaluation' then raise exception 'Case is not awaiting evaluation'; end if;
  if c.evaluation_started_at is not null then return; end if;
  update cases set evaluation_started_at=clock_timestamp() where id=c.id;
  insert into case_events(case_id,event_type,actor_id,actor_role) values(c.id,'evaluation_started',auth.uid(),'purchase_officer');
end $$;

create function require_evaluation_started() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from cases c join profiles p on p.id=auth.uid() where c.id=new.case_id and c.evaluation_started_at is not null and p.is_active and p.role='purchase_officer' and c.assigned_po_id=p.id) then
    raise exception 'Start the evaluation before submitting an offer';
  end if;
  return new;
end $$;
create trigger evaluation_must_be_started before insert on case_offers for each row execute function require_evaluation_started();

create function submit_po_evaluation(
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

revoke all on function start_po_evaluation(uuid), require_evaluation_started() from public, anon, authenticated;
grant execute on function start_po_evaluation(uuid) to authenticated;
revoke execute on function submit_po_evaluation(uuid, boolean, text, numeric) from public, anon;
grant execute on function submit_po_evaluation(uuid, boolean, text, numeric) to authenticated;

-- =========================================================================
-- 13. record_customer_decision / close_case / cancel_case /
--     record_customer_counter_offer: SO's actions again.
-- =========================================================================
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
begin
  select * into v_case from cases where id = p_case_id for update;

  if v_case is null then
    raise exception 'Case not found';
  end if;

  if v_case.sales_officer_id != auth.uid() then
    raise exception 'Not authorized to record a decision on this case';
  end if;

  if v_case.status != 'pending_customer_decision' then
    raise exception 'Case is not awaiting a customer decision';
  end if;

  if p_decision = 'accepted' then
    v_new_status := 'purchase_completion_pending';
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
      status = v_new_status
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role, metadata)
  values (
    p_case_id,
    'customer_decision_recorded',
    auth.uid(),
    'sales_officer',
    jsonb_build_object('decision', p_decision, 'broker_consent', p_broker_consent)
  );

  if v_new_status = 'listed_for_brokers' then
    insert into case_events (case_id, event_type, actor_id, actor_role)
    values (p_case_id, 'listed_for_brokers', auth.uid(), 'sales_officer');
  end if;

  return v_case;
end;
$$;

create or replace function close_case(p_case_id uuid)
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

  if v_case.sales_officer_id != auth.uid() then
    raise exception 'Not authorized to close this case';
  end if;

  if v_case.status != 'purchase_completion_pending' then
    raise exception 'Case is not awaiting completion';
  end if;

  update cases
  set status = 'closed', closed_at = now(), closed_by = auth.uid()
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role)
  values (p_case_id, 'case_closed', auth.uid(), 'sales_officer');

  return v_case;
end;
$$;

create or replace function cancel_case(p_case_id uuid, p_reason text)
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

  if v_case.sales_officer_id != auth.uid() then
    raise exception 'Not authorized to cancel this case';
  end if;

  if v_case.status != 'purchase_completion_pending' then
    raise exception 'Case is not awaiting completion';
  end if;

  if p_reason is null or trim(both E' \t\n\r' from p_reason) = '' then
    raise exception 'A cancellation reason is required';
  end if;

  update cases
  set status = 'cancelled', cancelled_at = now(), cancelled_reason = p_reason
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role, notes)
  values (p_case_id, 'case_cancelled', auth.uid(), 'sales_officer', p_reason);

  return v_case;
end;
$$;

create or replace function record_customer_counter_offer(
  p_case_id uuid,
  p_counter_offer_price numeric,
  p_note text default null
)
returns cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case cases;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into v_case from cases where id = p_case_id for update;

  if v_case is null then
    raise exception 'Case not found';
  end if;

  if v_case.sales_officer_id != auth.uid() then
    raise exception 'Not authorized to record a counter offer on this case';
  end if;

  if v_case.status != 'pending_customer_decision' then
    raise exception 'Case is not awaiting a customer decision';
  end if;

  if p_counter_offer_price is null or p_counter_offer_price <= 0 or p_counter_offer_price >= 10000000000 then
    raise exception 'Enter a valid customer counter offer amount';
  end if;

  update cases
  set customer_counter_offer_price = p_counter_offer_price,
      customer_counter_offer_note = v_note,
      customer_counter_offer_at = now(),
      customer_counter_offer_by = auth.uid()
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role, metadata, notes)
  values (
    p_case_id,
    'customer_counter_offer_recorded',
    auth.uid(),
    'sales_officer',
    jsonb_build_object('amount', p_counter_offer_price),
    v_note
  );

  return v_case;
end;
$$;

-- =========================================================================
-- 14. so_broker_summary: SO's own broker-activity dashboard tile (replaces
--     po_broker_summary, dropped in step 1).
-- =========================================================================
create function so_broker_summary() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from profiles where id=auth.uid() and role='sales_officer' and is_active) then raise exception 'Active SO required'; end if;
  return (with owned as (
    select c.id, exists(select 1 from broker_reservations r where r.case_id=c.id and r.status='active' and r.expires_at>now()) reserved,
      exists(select 1 from broker_reservations r where r.case_id=c.id and r.status='active' and r.expires_at>now() and r.expires_at<=now()+interval '2 hours') expiring,
      not exists(select 1 from broker_reservations r where r.case_id=c.id and r.status='active' and r.expires_at<=now())
        and exists(select 1 from broker_offers o join brokers b on b.id=o.broker_id where o.case_id=c.id and o.status='current' and b.status='approved' and b.suspended_at is null) has_offers
    from cases c where c.sales_officer_id=auth.uid() and c.status in ('listed_for_brokers','broker_offer_selected') and c.broker_consent
  ) select jsonb_build_object('listed',count(*) filter(where not reserved),'reserved',count(*) filter(where reserved),
      'awaiting_selection',count(*) filter(where not reserved and has_offers),'expiring',count(*) filter(where expiring)) from owned);
end $$;
revoke all on function so_broker_summary() from public,anon;
grant execute on function so_broker_summary() to authenticated;

-- =========================================================================
-- 15. po_manager_*: evaluation-backlog reporting returns (pending/evaluated
--     breakdown per PO, replacing the single assigned/closed count).
-- =========================================================================
create or replace function po_manager_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'po_manager' and is_active) then
    raise exception 'Active PO Manager required';
  end if;
  select jsonb_build_object(
    'total_cases', (select count(*) from cases where assigned_po_id is not null),
    'evaluated_total', (select count(*) from case_offers),
    'closed_total', (select count(*) from cases where status in ('closed', 'broker_deal_closed')),
    'pending_cases', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'submitted_at', c.submitted_at, 'evaluation_started_at', c.evaluation_started_at,
        'po_id', p.id, 'po_name', p.full_name, 'po_employee_id', p.employee_id, 'branch_name', b.name
      )), '[]')
      from cases c join profiles p on p.id = c.assigned_po_id join branches b on b.id = c.branch_id
      where c.status = 'pending_evaluation'
    ),
    'pos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.full_name, 'employee_id', p.employee_id, 'branch_name', b.name, 'is_active', p.is_active,
        'assigned_total', (select count(*) from cases c where c.assigned_po_id = p.id),
        'pending', (select count(*) from cases c where c.assigned_po_id = p.id and c.status = 'pending_evaluation'),
        'evaluated', (select count(*) from case_offers o where o.purchase_officer_id = p.id)
      ) order by p.full_name), '[]')
      from profiles p join branches b on b.id = p.branch_id where p.role = 'purchase_officer'
    )
  ) into result;
  return result;
end $$;

create or replace function po_manager_cases(p_search text default '', p_branch uuid default null, p_status text default null, p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'po_manager' and is_active) then
    raise exception 'Active PO Manager required';
  end if;
  with scoped as (
    select c.*, b.name branch_name, p.full_name po_name, p.employee_id po_employee_id,
      o.offer_price, o.submitted_at offer_submitted_at
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

create or replace function po_manager_case(p_case_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'po_manager' and is_active) then
    raise exception 'Active PO Manager required';
  end if;
  select jsonb_build_object(
    'id', c.id, 'case_ref', c.case_ref, 'status', c.status, 'branch_name', b.name,
    'sales_officer_name', so.full_name, 'sales_officer_employee_id', so.employee_id,
    'po_name', po.full_name, 'po_employee_id', po.employee_id,
    'vehicle_reg_number', c.vehicle_reg_number, 'make', c.make, 'model', c.model, 'variant', c.variant,
    'registration_year', c.registration_year, 'fuel_type', c.fuel_type, 'transmission', c.transmission,
    'odometer_km', c.odometer_km, 'ownership_count', c.ownership_count,
    'has_loan', c.has_loan, 'lender_note', c.lender_note,
    'created_at', c.created_at, 'submitted_at', c.submitted_at, 'evaluation_started_at', c.evaluation_started_at
  ) into result
  from cases c
  join branches b on b.id = c.branch_id
  left join profiles so on so.id = c.sales_officer_id
  left join profiles po on po.id = c.assigned_po_id
  where c.id = p_case_id and c.assigned_po_id is not null;
  if result is null then raise exception 'Case not found'; end if;
  return result;
end $$;

revoke all on function po_manager_summary() from public, anon;
grant execute on function po_manager_summary() to authenticated;
revoke all on function po_manager_cases(text, uuid, text, integer) from public, anon;
grant execute on function po_manager_cases(text, uuid, text, integer) to authenticated;
revoke all on function po_manager_case(uuid) from public, anon;
grant execute on function po_manager_case(uuid) to authenticated;
