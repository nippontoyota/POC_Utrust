-- Major revamp: Sales Officer role removed entirely. The Procurement Officer
-- (role code stays purchase_officer; UI label becomes "Procurement Officer")
-- now captures the customer/vehicle intake AND both prices in one combined
-- case, then later records the customer's decision themselves -- no more
-- draft(SO) -> submit -> round-robin-assign -> PO-evaluates handoff.
--
-- Broker Coordinator (Philip) loses photo-review/approval and the listing
-- gate (photos auto-publish to brokers, minus plate-visible ones, the moment
-- a case is actually listed); he keeps selecting the winning offer and
-- accept/reject/release/complete on the reservation, unchanged.
--
-- This migration assumes all case/broker/admin-event data has already been
-- wiped (see the accompanying data-wipe step) and that the only profiles
-- left are PURCHASEMGR, PHILIP and admin -- so the enum/column rewrites
-- below have no rows to reconcile.

-- =========================================================================
-- 1. Drop everything tied to the old two-phase (SO intake -> PO evaluation)
--    workflow before the columns/enum values it depends on disappear.
-- =========================================================================
drop trigger if exists cases_require_rc_book_before_evaluation on cases;
drop function if exists require_case_submission_photos();
drop trigger if exists evaluation_must_be_started on case_offers;
drop function if exists require_evaluation_started();
drop function if exists start_po_evaluation(uuid);
drop function if exists submit_po_evaluation(uuid, boolean, text, numeric);
drop function if exists submit_case_for_evaluation(uuid);
drop function if exists so_broker_summary();
drop function if exists review_broker_photo(uuid, boolean);

drop policy if exists case_offers_select on case_offers;
drop table if exists case_offers;

-- =========================================================================
-- 2. cases: collapse sales_officer_id/assigned_po_id into one po_id owner,
--    add so_name (free text, no account behind it) and nippon_offer_price
--    (entered at creation time instead of a separate evaluation step).
-- =========================================================================
-- These policies reference sales_officer_id/assigned_po_id/status directly
-- (not just via current_profile_role()), so CASCADE from dropping that
-- function doesn't reach them, and Postgres won't let a column's type
-- change while any policy still depends on it -- drop every one of them,
-- on every table, before touching a single column below.
drop policy if exists cases_select on cases;
drop policy if exists cases_insert_so on cases;
drop policy if exists cases_update_so_draft on cases;
drop policy if exists cases_delete_so_draft on cases;
drop policy if exists case_photos_select on case_photos;
drop policy if exists case_photos_insert_so on case_photos;
drop policy if exists case_photos_delete_so on case_photos;
drop policy if exists case_events_select on case_events;
drop policy if exists vehicle_photos_insert_so on storage.objects;
drop policy if exists vehicle_photos_delete_so on storage.objects;

alter table cases rename column sales_officer_id to po_id;
alter table cases drop column assigned_po_id;
alter table cases drop column evaluation_started_at;
alter table cases add column so_name text;
alter table cases add column nippon_offer_price numeric(12, 2)
  check (nippon_offer_price is null or nippon_offer_price > 0);

alter table profiles drop column if exists last_assigned_at;

-- =========================================================================
-- 3. case_status: drop the now-unreachable pending_evaluation. 'draft' stays
--    -- it's still the brief window while a PO is filling the combined form
--    in before clicking Submit; nothing else about it changes.
-- =========================================================================
-- This partial index's predicate embeds case_status literals, which blocks
-- the type swap below just like a policy would -- drop and recreate it.
drop index if exists uniq_open_vehicle_reg;

create type case_status_new as enum (
  'draft',
  'pending_customer_decision',
  'purchase_completion_pending',
  'closed',
  'cancelled',
  'withdrawn',
  'rejected_not_listed',
  'listed_for_brokers',
  'broker_offer_selected',
  'no_broker_interest',
  'broker_deal_closed'
);
alter table cases alter column status drop default;
alter table cases alter column status type case_status_new using status::text::case_status_new;
drop type case_status;
alter type case_status_new rename to case_status;
alter table cases alter column status set default 'draft';

create unique index uniq_open_vehicle_reg on cases (vehicle_reg_number)
  where status not in ('closed', 'cancelled', 'withdrawn', 'rejected_not_listed', 'no_broker_interest', 'broker_deal_closed');

-- =========================================================================
-- 4. app_role: remove sales_officer entirely (recreate the type; Postgres
--    can't drop a single enum value). Caller cascades (policies/functions
--    referencing current_profile_role()'s return type) are recreated after.
-- =========================================================================
-- profiles_role_scope_check's CHECK expression embeds app_role literals,
-- which blocks the column type swap below the same way the index did --
-- drop it first, recreate (against the new type) further down.
drop policy if exists profiles_insert_self_staff on profiles;
alter table profiles drop constraint if exists profiles_role_scope_check;
drop function if exists current_profile_role() cascade;
drop function if exists admin_reassign_profile(uuid, app_role, uuid, uuid, text);

create type app_role_new as enum (
  'purchase_officer', 'sales_manager', 'cluster_manager', 'po_manager', 'admin', 'broker_coordinator'
);
alter table profiles alter column role type app_role_new using role::text::app_role_new;
drop type app_role;
alter type app_role_new rename to app_role;

create function current_profile_role()
returns app_role
language sql stable security definer set search_path = public
as $$ select role from profiles where id = auth.uid() $$;

create policy profiles_insert_self_staff on profiles for insert to authenticated
  with check (id = auth.uid() and role = 'purchase_officer'::app_role);

alter table profiles add constraint profiles_role_scope_check check (
  case role
    when 'purchase_officer' then (branch_id is not null and cluster_id is null)
    when 'sales_manager' then (branch_id is not null and cluster_id is null)
    when 'cluster_manager' then (branch_id is null and cluster_id is not null)
    when 'po_manager' then (branch_id is null and cluster_id is null)
    when 'admin' then (branch_id is null and cluster_id is null)
    when 'broker_coordinator' then (branch_id is null and cluster_id is null)
    else null
  end
);

create function admin_reassign_profile(
  p_profile_id uuid, p_role app_role, p_branch_id uuid default null, p_cluster_id uuid default null, p_full_name text default null
)
returns void
language plpgsql security definer set search_path = public
as $admin_reassign$
declare v_target profiles;
begin
  if not is_active_admin() then raise exception 'Active admin required'; end if;
  select * into v_target from profiles where id = p_profile_id for update;
  if v_target.id is null then raise exception 'Account not found'; end if;
  update profiles set
    role = p_role,
    branch_id = p_branch_id,
    cluster_id = p_cluster_id,
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name)
  where id = p_profile_id;
  insert into admin_events(actor_id, action, target_type, target_id, metadata)
    values(auth.uid(), 'profile_reassigned', 'profile', p_profile_id,
      jsonb_build_object('from_role', v_target.role, 'to_role', p_role, 'branch_id', p_branch_id, 'cluster_id', p_cluster_id));
end;
$admin_reassign$;

revoke execute on function admin_reassign_profile(uuid, app_role, uuid, uuid, text) from public, anon;
grant execute on function admin_reassign_profile(uuid, app_role, uuid, uuid, text) to authenticated;

-- Recreate the `cases` policies current_profile_role() cascade just dropped,
-- against the new single po_id owner column.
create policy cases_insert_po on cases for insert to authenticated
  with check (
    current_profile_role() = 'purchase_officer'
    and po_id = auth.uid()
    and branch_id = current_profile_branch()
    and status = 'draft'
  );

create policy cases_update_po on cases for update to authenticated
  using (
    current_profile_role() = 'purchase_officer'
    and po_id = auth.uid()
    and status in ('draft', 'pending_customer_decision')
  )
  with check (
    current_profile_role() = 'purchase_officer'
    and po_id = auth.uid()
    and status in ('draft', 'pending_customer_decision')
  );

create policy cases_delete_po_draft on cases for delete to authenticated
  using (current_profile_role() = 'purchase_officer' and po_id = auth.uid() and status = 'draft');

create policy cases_select on cases for select to authenticated
  using (
    (current_profile_role() = 'purchase_officer' and po_id = auth.uid())
    or manager_branch_access(branch_id)
    or (current_profile_role() = 'broker_coordinator' and broker_consent is true)
  );

-- =========================================================================
-- 5. manager_case_access: same single-owner swap, feeds case_photos/
--    case_events/staff_broker_case for every manager-family role at once.
-- =========================================================================
create or replace function manager_case_access(p_case_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from cases c where c.id = p_case_id and (
      (current_profile_role() = 'purchase_officer' and c.po_id = auth.uid())
      or manager_branch_access(c.branch_id)
      or (current_profile_role() = 'po_manager')
      or (current_profile_role() = 'broker_coordinator' and c.broker_consent is true)
    )
  )
$$;

create policy case_photos_select on case_photos for select to authenticated using (manager_case_access(case_id));

create policy case_events_select on case_events for select to authenticated using (manager_case_access(case_id));

-- =========================================================================
-- 6. case_photos: PO (not SO) owns upload/delete, over the same extended
--    draft+pending_customer_decision edit window as the cases table itself.
--    broker_visible is no longer reviewer-set -- it's computed automatically
--    the moment a photo is inserted, straight from category/is_plate_visible.
-- =========================================================================
create policy case_photos_insert_po on case_photos for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from cases c
      where c.id = case_photos.case_id
        and c.po_id = auth.uid()
        and c.status in ('draft', 'pending_customer_decision')
    )
  );

create policy case_photos_delete_po on case_photos for delete to authenticated
  using (
    exists (
      select 1 from cases c
      where c.id = case_photos.case_id
        and c.po_id = auth.uid()
        and c.status in ('draft', 'pending_customer_decision')
    )
  );

alter table case_photos drop column if exists reviewed_at;
alter table case_photos drop column if exists reviewed_by;

create or replace function set_case_photo_broker_visible()
returns trigger
language plpgsql
as $$
begin
  new.broker_visible := new.category <> 'rc_book' and not new.is_plate_visible;
  return new;
end;
$$;

create trigger case_photos_auto_broker_visible
  before insert on case_photos
  for each row
  execute function set_case_photo_broker_visible();

-- Storage: same owner/status-window swap for the vehicle-photos bucket.
create policy vehicle_photos_insert_po on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and exists (
      select 1 from cases c
      where c.id::text = (storage.foldername(name))[1]
        and c.po_id = auth.uid()
        and c.status in ('draft', 'pending_customer_decision')
    )
  );

create policy vehicle_photos_delete_po on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and exists (
      select 1 from cases c
      where c.id::text = (storage.foldername(name))[1]
        and c.po_id = auth.uid()
        and c.status in ('draft', 'pending_customer_decision')
    )
  );

-- =========================================================================
-- 7. Column-level grants: cases is locked down to explicit column lists:
--    re-grant insert/update against the new column set (po_id replaces
--    sales_officer_id; so_name and nippon_offer_price are new).
-- =========================================================================
revoke insert, update on cases from authenticated;
grant insert(branch_id, po_id, status) on cases to authenticated;
grant update(
  customer_name, customer_mobile, vehicle_reg_number, make, model, variant, color,
  registration_year, fuel_type, transmission, odometer_km, ownership_count,
  has_loan, lender_note, customer_expected_price, nippon_offer_price, so_name
) on cases to authenticated;

revoke insert, update on case_photos from authenticated;
grant insert(case_id, category, file_size_bytes, id, is_plate_visible, mime_type, storage_path, uploaded_by) on case_photos to authenticated;

-- =========================================================================
-- 8. submit_case: draft -> pending_customer_decision. Validates every
--    required field (including the new nippon_offer_price/so_name) and the
--    photo set (RC book + >=6 vehicle photos) in one step -- no round-robin
--    PO assignment, since the PO already owns the case from creation.
-- =========================================================================
create function submit_case(p_case_id uuid)
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
begin
  select * into v_case from cases where id = p_case_id for update;

  if v_case is null then
    raise exception 'Case not found';
  end if;

  if v_case.po_id != auth.uid() then
    raise exception 'Not authorized to submit this case';
  end if;

  if v_case.status != 'draft' then
    raise exception 'Case is not in draft status';
  end if;

  if v_case.customer_name is null or v_case.customer_mobile is null
     or v_case.vehicle_reg_number is null or v_case.make is null
     or v_case.model is null or v_case.registration_year is null
     or v_case.fuel_type is null or v_case.transmission is null
     or v_case.odometer_km is null or v_case.has_loan is null
     or v_case.customer_expected_price is null or v_case.nippon_offer_price is null
     or v_case.so_name is null or trim(v_case.so_name) = '' then
    raise exception 'Case is missing required fields';
  end if;

  if not exists(select 1 from case_photos where case_id = p_case_id and category = 'rc_book') then
    raise exception 'An RC book photo is required before submitting';
  end if;

  if (select count(*) from case_photos where case_id = p_case_id and category <> 'rc_book') < 6 then
    raise exception 'At least 6 vehicle photos are required in addition to the RC book photo';
  end if;

  select code into v_branch_code from branches where id = v_case.branch_id;
  v_yyyymm := to_char(now(), 'YYYYMM');

  insert into case_ref_counters (branch_id, yyyymm, next_seq)
  values (v_case.branch_id, v_yyyymm, 2)
  on conflict (branch_id, yyyymm) do update set next_seq = case_ref_counters.next_seq + 1
  returning next_seq - 1 into v_seq;

  update cases
  set status = 'pending_customer_decision',
      case_ref = 'UT-' || v_branch_code || '-' || v_yyyymm || '-' || lpad(v_seq::text, 4, '0'),
      submitted_at = now()
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role, metadata)
  values (p_case_id, 'case_submitted', auth.uid(), 'purchase_officer', jsonb_build_object('nippon_offer_price', v_case.nippon_offer_price));

  return v_case;
end;
$$;

revoke execute on function submit_case(uuid) from public, anon;
grant execute on function submit_case(uuid) to authenticated;

-- =========================================================================
-- 9. record_customer_decision / close_case / cancel_case / withdraw_case /
--    record_customer_counter_offer: same owner-column + actor-role rename,
--    no business-logic change (completeness is already enforced up front by
--    submit_case above, so these don't re-check it).
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

  if v_case.po_id != auth.uid() then
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
    'purchase_officer',
    jsonb_build_object('decision', p_decision, 'broker_consent', p_broker_consent)
  );

  if v_new_status = 'listed_for_brokers' then
    insert into case_events (case_id, event_type, actor_id, actor_role)
    values (p_case_id, 'listed_for_brokers', auth.uid(), 'purchase_officer');
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

  if v_case.po_id != auth.uid() then
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
  values (p_case_id, 'case_closed', auth.uid(), 'purchase_officer');

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

  if v_case.po_id != auth.uid() then
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
  values (p_case_id, 'case_cancelled', auth.uid(), 'purchase_officer', p_reason);

  return v_case;
end;
$$;

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

  if v_case.po_id != auth.uid() then
    raise exception 'Not authorized to withdraw this case';
  end if;

  if v_case.status not in ('draft', 'pending_customer_decision') then
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
  values (p_case_id, 'case_withdrawn', auth.uid(), 'purchase_officer', p_reason);

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

  if v_case.po_id != auth.uid() then
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
    'purchase_officer',
    jsonb_build_object('amount', p_counter_offer_price),
    v_note
  );

  return v_case;
end;
$$;

revoke execute on function record_customer_decision(uuid, customer_decision_type, boolean) from public, anon;
grant execute on function record_customer_decision(uuid, customer_decision_type, boolean) to authenticated;
revoke execute on function close_case(uuid) from public, anon;
grant execute on function close_case(uuid) to authenticated;
revoke execute on function cancel_case(uuid, text) from public, anon;
grant execute on function cancel_case(uuid, text) to authenticated;
revoke execute on function withdraw_case(uuid, text) from public, anon;
grant execute on function withdraw_case(uuid, text) to authenticated;
revoke execute on function record_customer_counter_offer(uuid, numeric, text) from public, anon;
grant execute on function record_customer_counter_offer(uuid, numeric, text) to authenticated;

-- =========================================================================
-- 10. broker_marketplace: add the single reference-price total (customer's
--     expected price + 10,000) to each listing -- never the raw customer
--     price, never broken down. broker_case_action/review gates are
--     untouched: they already just check "at least one broker_visible
--     photo exists", which auto-visibility satisfies with no code change.
-- =========================================================================
create or replace function broker_marketplace(p_search text default '', p_branch uuid default null, p_view text default 'marketplace', p_page integer default 0, p_sort text default 'newest', p_case_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not is_approved_broker() then raise exception 'Approved broker required'; end if;
  with visible as (
    select c.*, b.name branch_name, o.id own_offer_id,o.amount own_amount,o.status own_status,o.revision own_revision,o.note own_note,o.submitted_at own_submitted_at,
      r.id hold_id,r.broker_id hold_broker,r.expires_at hold_deadline,
      exists(select 1 from broker_reservations h where h.case_id=c.id and h.broker_id=auth.uid()) has_history,
      exists(select 1 from case_photos ph where ph.case_id=c.id and ph.broker_visible and not ph.is_plate_visible) has_photos
    from cases c join branches b on b.id=c.branch_id
    left join broker_offers o on o.case_id=c.id and o.broker_id=auth.uid()
    left join broker_reservations r on r.case_id=c.id and r.status='active'
    where (p_case_id is null or c.id=p_case_id) and (p_branch is null or c.branch_id=p_branch)
      and concat_ws(' ',c.case_ref,c.make,c.model,c.variant) ilike '%' || left(coalesce(p_search,''),100) || '%'
  ), filtered as (
    select *, (status in ('listed_for_brokers','broker_offer_selected') and broker_consent and has_photos) is_listed,
      (hold_id is not null and hold_deadline>now()) reserved
    from visible
  ), eligible as (
    select * from filtered where
      (p_view='marketplace' and is_listed) or
      (p_view='offers' and own_offer_id is not null) or
      (p_view='reservations' and hold_broker=auth.uid() and reserved) or
      (p_view='history' and has_history)
  ), paged as (
    select * from eligible order by
      case when p_sort='year' then registration_year end desc nulls last,
      case when p_sort='mileage' then odometer_km end asc nulls last,
      listed_at desc nulls last,id limit 12 offset greatest(0,least(coalesce(p_page,0),10000))*12
  ) select jsonb_build_object('total',(select count(*) from eligible),'server_now',now(),'items',coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'case_ref',e.case_ref,'branch_name',e.branch_name,'make',e.make,'model',e.model,'variant',e.variant,
    'registration_year',e.registration_year,'odometer_km',e.odometer_km,'fuel_type',e.fuel_type,'transmission',e.transmission,
    'availability',case when not e.is_listed then 'unavailable' when e.reserved then 'reserved' else 'open' end,
    'expires_at',case when e.reserved then e.hold_deadline end,
    'reference_price',case when e.is_listed and e.customer_expected_price is not null then e.customer_expected_price + 10000 end,
    'own_offer',case when e.own_offer_id is not null then jsonb_build_object('id',e.own_offer_id,'amount',e.own_amount,'status',case when e.hold_id is not null and not e.reserved and e.own_status in ('current','selected') then 'reconfirm' else e.own_status end,'revision',e.own_revision,'note',e.own_note,'submitted_at',e.own_submitted_at) end,
    'photos',case when e.is_listed then (select coalesce(jsonb_agg(jsonb_build_object('id',ph.id,'category',ph.category,'file_size_bytes',ph.file_size_bytes)),'[]') from case_photos ph where ph.case_id=e.id and ph.broker_visible and not ph.is_plate_visible) else '[]'::jsonb end,
    'reservations',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'amount',h.amount,'status',case when h.status='active' and h.expires_at<=now() then 'expired' else h.status end,'started_at',h.started_at,'expires_at',h.expires_at,'customer_decision',h.customer_decision,'ended_at',h.ended_at) order by h.started_at desc),'[]') from broker_reservations h where h.case_id=e.id and h.broker_id=auth.uid()),
    'history',(select coalesce(jsonb_agg(jsonb_build_object('id',ev.id,'event_type',ev.event_type,'created_at',ev.created_at,'amount',ev.metadata->'amount') order by ev.created_at desc),'[]') from case_events ev where ev.case_id=e.id and ev.metadata->>'broker_id'=auth.uid()::text)
  )),'[]')) into result from paged e;
  return result;
end $$;

-- =========================================================================
-- 11. po_manager_*: rework around the single-step workflow -- no more
--     evaluation backlog, inspection, or case_offers to report on. Reports
--     submitted vs. closed per PO instead of pending vs. evaluated.
-- =========================================================================
create or replace function po_manager_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'po_manager' and is_active) then
    raise exception 'Active PO Manager required';
  end if;
  select jsonb_build_object(
    'total_cases', (select count(*) from cases where status <> 'draft'),
    'closed_total', (select count(*) from cases where status in ('closed', 'broker_deal_closed')),
    'pos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.full_name, 'employee_id', p.employee_id, 'branch_name', b.name, 'is_active', p.is_active,
        'assigned_total', (select count(*) from cases c where c.po_id = p.id and c.status <> 'draft'),
        'closed_total', (select count(*) from cases c where c.po_id = p.id and c.status in ('closed', 'broker_deal_closed'))
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
    select c.*, b.name branch_name, p.full_name po_name, p.employee_id po_employee_id
    from cases c
    join branches b on b.id = c.branch_id
    left join profiles p on p.id = c.po_id
    where c.status <> 'draft'
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
      'nippon_offer_price', s.nippon_offer_price, 'submitted_at', s.submitted_at
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
    'so_name', c.so_name,
    'po_name', po.full_name, 'po_employee_id', po.employee_id,
    'vehicle_reg_number', c.vehicle_reg_number, 'make', c.make, 'model', c.model, 'variant', c.variant,
    'registration_year', c.registration_year, 'fuel_type', c.fuel_type, 'transmission', c.transmission,
    'odometer_km', c.odometer_km, 'ownership_count', c.ownership_count,
    'has_loan', c.has_loan, 'lender_note', c.lender_note, 'nippon_offer_price', c.nippon_offer_price,
    'created_at', c.created_at, 'submitted_at', c.submitted_at
  ) into result
  from cases c
  join branches b on b.id = c.branch_id
  left join profiles po on po.id = c.po_id
  where c.id = p_case_id and c.status <> 'draft';
  if result is null then raise exception 'Case not found'; end if;
  return result;
end $$;
