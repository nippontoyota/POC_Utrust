-- =============================================================================
-- 0039: Three interlinked features
--
--   1. 72-hour customer decision window
--      – offer_deadline_at column on cases (= case_offers.submitted_at + 72h)
--      – no_customer_decision case_status value
--      – expire_customer_decision() RPC: PO manually marks expired after 72h
--
--   2. Multi-round negotiation during pending_customer_decision
--      – case_negotiations table (customer_counter / nippon_revised rounds)
--      – record_negotiation_round() RPC: PO records each round
--      – Deprecate old single-shot customer_counter_offer_* columns (kept
--        for backwards-compat; record_customer_counter_offer() is dropped
--        because the SO no longer drives this — PO does via new RPC).
--
--   3. PO photo management for broker listing
--      – PO can upload/delete photos when status = 'listed_for_brokers'
--      – set_photo_broker_visibility() RPC: PO toggles broker_visible per photo
--        (rc_book photos are always false and cannot be toggled)
-- =============================================================================

-- =========================================================================
-- 1. New case_status value: no_customer_decision
-- =========================================================================
-- Postgres can't add a value to an existing enum inside a transaction.
-- Use the DDL-only approach: recreate the type.
-- Must drop the partial index that embeds status literals first.
drop index if exists uniq_open_vehicle_reg;

create type case_status_new as enum (
  'draft',
  'pending_evaluation',
  'pending_customer_decision',
  'purchase_completion_pending',
  'closed',
  'cancelled',
  'withdrawn',
  'rejected_not_listed',
  'listed_for_brokers',
  'broker_offer_selected',
  'no_broker_interest',
  'broker_deal_closed',
  'no_customer_decision'
);

alter table cases alter column status drop default;
alter table cases alter column status type case_status_new using status::text::case_status_new;
drop type case_status;
alter type case_status_new rename to case_status;
alter table cases alter column status set default 'draft';

-- Recreate the partial unique index (no_customer_decision is terminal).
create unique index uniq_open_vehicle_reg on cases (vehicle_reg_number)
  where status not in (
    'closed', 'cancelled', 'withdrawn', 'rejected_not_listed',
    'no_broker_interest', 'broker_deal_closed', 'no_customer_decision'
  );

-- =========================================================================
-- 2. offer_deadline_at column on cases
--    Set automatically by a trigger when a case_offers row is inserted.
-- =========================================================================
alter table cases add column if not exists offer_deadline_at timestamptz;

-- Trigger: when PO submits the evaluation offer (inserts into case_offers),
-- stamp offer_deadline_at = submitted_at + 72 hours onto the parent case.
create or replace function set_offer_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update cases
  set offer_deadline_at = new.submitted_at + interval '72 hours'
  where id = new.case_id;
  return new;
end;
$$;

drop trigger if exists case_offers_set_deadline on case_offers;
create trigger case_offers_set_deadline
  after insert on case_offers
  for each row
  execute function set_offer_deadline();

-- =========================================================================
-- 3. expire_customer_decision: PO manually closes a window with no decision
-- =========================================================================
create or replace function expire_customer_decision(p_case_id uuid)
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

  if v_case.assigned_po_id is distinct from auth.uid() then
    raise exception 'Only the assigned Purchase Officer can expire this window';
  end if;

  if v_case.status <> 'pending_customer_decision' then
    raise exception 'Case is not awaiting a customer decision';
  end if;

  if v_case.offer_deadline_at is null or now() < v_case.offer_deadline_at then
    raise exception 'The 72-hour window has not yet elapsed';
  end if;

  update cases
  set status = 'no_customer_decision'
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role)
  values (p_case_id, 'offer_window_expired', auth.uid(), 'purchase_officer');

  return v_case;
end;
$$;

revoke execute on function expire_customer_decision(uuid) from public, anon;
grant execute on function expire_customer_decision(uuid) to authenticated;

-- =========================================================================
-- 4. case_negotiations table — multi-round back-and-forth
-- =========================================================================
create table if not exists case_negotiations (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references cases (id),
  round        int  not null,
  direction    text not null check (direction in ('customer_counter', 'nippon_revised')),
  amount       numeric(12, 2) not null check (amount > 0 and amount < 10000000000),
  note         text check (note is null or length(note) <= 1000),
  recorded_by  uuid references profiles (id),
  recorded_at  timestamptz not null default now(),
  unique (case_id, round)
);

alter table case_negotiations enable row level security;

-- Readable by: assigned PO, assigned SO (if they are the sales_officer_id),
-- and any manager/admin/broker-coordinator via manager_case_access.
create policy case_negotiations_select on case_negotiations
  for select to authenticated
  using (manager_case_access(case_id));

-- Insertable only by the assigned PO (enforced in the RPC below, but also
-- locked at RLS level).
create policy case_negotiations_insert on case_negotiations
  for insert to authenticated
  with check (
    recorded_by = auth.uid()
    and exists (
      select 1 from cases c
      where c.id = case_negotiations.case_id
        and c.assigned_po_id = auth.uid()
        and c.status = 'pending_customer_decision'
    )
  );

-- =========================================================================
-- 5. record_negotiation_round RPC
-- =========================================================================
create or replace function record_negotiation_round(
  p_case_id   uuid,
  p_direction text,
  p_amount    numeric,
  p_note      text default null
)
returns case_negotiations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case  cases;
  v_round int;
  v_note  text := nullif(trim(coalesce(p_note, '')), '');
  v_row   case_negotiations;
begin
  select * into v_case from cases where id = p_case_id for update;

  if v_case is null then
    raise exception 'Case not found';
  end if;

  if v_case.assigned_po_id is distinct from auth.uid() then
    raise exception 'Only the assigned Purchase Officer can record negotiation rounds';
  end if;

  if v_case.status <> 'pending_customer_decision' then
    raise exception 'Negotiation rounds can only be recorded while the case is awaiting a customer decision';
  end if;

  if p_direction not in ('customer_counter', 'nippon_revised') then
    raise exception 'Direction must be customer_counter or nippon_revised';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount >= 10000000000 then
    raise exception 'Enter a valid amount between INR 1 and INR 99,99,99,999';
  end if;

  -- Auto-increment round number per case.
  select coalesce(max(round), 0) + 1 into v_round
  from case_negotiations
  where case_id = p_case_id;

  insert into case_negotiations (case_id, round, direction, amount, note, recorded_by)
  values (p_case_id, v_round, p_direction, p_amount, v_note, auth.uid())
  returning * into v_row;

  insert into case_events (case_id, event_type, actor_id, actor_role, metadata, notes)
  values (
    p_case_id,
    'negotiation_round_recorded',
    auth.uid(),
    'purchase_officer',
    jsonb_build_object('round', v_round, 'direction', p_direction, 'amount', p_amount),
    v_note
  );

  return v_row;
end;
$$;

revoke execute on function record_negotiation_round(uuid, text, numeric, text) from public, anon;
grant execute on function record_negotiation_round(uuid, text, numeric, text) to authenticated;

-- =========================================================================
-- 6. set_photo_broker_visibility RPC — PO toggles broker_visible per photo
--    rc_book photos always stay false; is_plate_visible photos stay false.
-- =========================================================================
create or replace function set_photo_broker_visibility(
  p_photo_id uuid,
  p_visible  boolean
)
returns case_photos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo case_photos;
  v_case  cases;
begin
  select * into v_photo from case_photos where id = p_photo_id;

  if v_photo is null then
    raise exception 'Photo not found';
  end if;

  select * into v_case from cases where id = v_photo.case_id;

  -- Only the assigned PO can toggle visibility.
  if v_case.assigned_po_id is distinct from auth.uid() then
    raise exception 'Only the assigned Purchase Officer can change photo visibility';
  end if;

  -- Only allowed in listed_for_brokers status (broker listing prep phase).
  if v_case.status <> 'listed_for_brokers' then
    raise exception 'Photo visibility can only be changed once the case is listed for brokers';
  end if;

  -- RC book photos are ALWAYS hidden from brokers — enforce unconditionally.
  if v_photo.category = 'rc_book' then
    raise exception 'RC book photos are always private and cannot be made visible to brokers';
  end if;

  -- is_plate_visible photos should remain hidden; block enabling them.
  if p_visible = true and v_photo.is_plate_visible = true then
    raise exception 'Photos showing the number plate cannot be made visible to brokers';
  end if;

  update case_photos
  set broker_visible = p_visible
  where id = p_photo_id
  returning * into v_photo;

  return v_photo;
end;
$$;

revoke execute on function set_photo_broker_visibility(uuid, boolean) from public, anon;
grant execute on function set_photo_broker_visibility(uuid, boolean) to authenticated;

-- =========================================================================
-- 7. Extend PO photo upload/delete policies to cover listed_for_brokers
--    (PO can add new photos + delete their own in this status for broker prep)
-- =========================================================================

-- Drop old SO-only policies that 0035 created (draft-only insert/delete for SO):
drop policy if exists case_photos_insert_so on case_photos;
drop policy if exists case_photos_delete_so on case_photos;
drop policy if exists vehicle_photos_insert_so on storage.objects;
drop policy if exists vehicle_photos_delete_so on storage.objects;

-- Recreate SO insert/delete (draft only, same as before):
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

-- NEW: PO insert/delete for listed_for_brokers (broker listing photo prep):
create policy case_photos_insert_po_listing on case_photos for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from cases c
      where c.id = case_photos.case_id
        and c.assigned_po_id = auth.uid()
        and c.status = 'listed_for_brokers'
    )
  );

create policy case_photos_delete_po_listing on case_photos for delete to authenticated
  using (
    uploaded_by = auth.uid()
    and exists (
      select 1 from cases c
      where c.id = case_photos.case_id
        and c.assigned_po_id = auth.uid()
        and c.status = 'listed_for_brokers'
    )
  );

create policy vehicle_photos_insert_po_listing on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and exists (
      select 1 from cases c
      where c.id::text = (storage.foldername(name))[1]
        and c.assigned_po_id = auth.uid()
        and c.status = 'listed_for_brokers'
    )
  );

create policy vehicle_photos_delete_po_listing on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and exists (
      select 1 from cases c
      where c.id::text = (storage.foldername(name))[1]
        and c.assigned_po_id = auth.uid()
        and c.status = 'listed_for_brokers'
    )
  );

-- =========================================================================
-- 8. broker_visible is now mutable (PO needs to UPDATE it via RPC).
--    Grant UPDATE on broker_visible to authenticated (security-definer RPC
--    handles all actual auth checks, but the column must be grantable).
-- =========================================================================
grant update(broker_visible) on case_photos to authenticated;
