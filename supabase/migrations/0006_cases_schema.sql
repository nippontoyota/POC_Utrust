-- Phase 2: case creation, draft editing, photo upload, and submission for evaluation.

create type case_status as enum (
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
  'broker_deal_closed'
);

create type fuel_type as enum ('petrol', 'diesel', 'cng', 'electric', 'hybrid');
create type transmission_type as enum ('manual', 'automatic');

-- =========================================================================
-- cases
-- =========================================================================
-- Business fields are nullable at the schema level so a Sales Officer can
-- save an incomplete draft and come back to it later. Completeness is
-- enforced at submission time by submit_case_for_evaluation(), not by
-- NOT NULL constraints here.
create table cases (
  id uuid primary key default gen_random_uuid(),
  case_ref text unique,
  branch_id uuid not null references branches (id),
  sales_officer_id uuid not null references profiles (id),
  assigned_po_id uuid references profiles (id),
  status case_status not null default 'draft',

  customer_name text,
  customer_mobile text,
  vehicle_reg_number text,
  make text,
  model text,
  variant text,
  registration_year int,
  fuel_type fuel_type,
  transmission transmission_type,
  odometer_km int,
  ownership_count int,
  has_loan boolean,
  lender_note text,
  customer_expected_price numeric(12, 2) check (customer_expected_price is null or customer_expected_price > 0),

  submitted_at timestamptz,
  withdrawn_at timestamptz,
  withdrawn_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger
language plpgsql as
$$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cases_set_updated_at
  before update on cases
  for each row
  execute function set_updated_at();

-- Block a new/open case for a vehicle registration number that already has
-- an open (non-terminal) case. NULLs (drafts with no reg number yet) never
-- conflict with each other under a unique index, so this only engages once
-- a reg number is actually entered.
create unique index uniq_open_vehicle_reg on cases (vehicle_reg_number)
  where status not in ('closed', 'cancelled', 'withdrawn', 'rejected_not_listed', 'no_broker_interest', 'broker_deal_closed');

alter table cases enable row level security;

create policy cases_select_so on cases
  for select to authenticated
  using (current_profile_role() = 'sales_officer' and sales_officer_id = auth.uid());

create policy cases_select_po on cases
  for select to authenticated
  using (current_profile_role() = 'purchase_officer' and assigned_po_id = auth.uid());

create policy cases_select_manager on cases
  for select to authenticated
  using (
    current_profile_role() = 'manager'
    and (current_profile_is_group_manager() or branch_id = current_profile_branch())
  );

create policy cases_insert_so on cases
  for insert to authenticated
  with check (
    current_profile_role() = 'sales_officer'
    and sales_officer_id = auth.uid()
    and branch_id = current_profile_branch()
    and status = 'draft'
  );

-- SO can edit their own case only while it's still a draft. All other
-- transitions (submit, withdraw, etc.) go through RPCs, not this policy.
create policy cases_update_so_draft on cases
  for update to authenticated
  using (current_profile_role() = 'sales_officer' and sales_officer_id = auth.uid() and status = 'draft')
  with check (current_profile_role() = 'sales_officer' and sales_officer_id = auth.uid() and status = 'draft');

create policy cases_delete_so_draft on cases
  for delete to authenticated
  using (current_profile_role() = 'sales_officer' and sales_officer_id = auth.uid() and status = 'draft');

-- =========================================================================
-- case_photos
-- =========================================================================
create table case_photos (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases (id) on delete cascade,
  storage_path text not null,
  category text not null check (category in ('front', 'rear', 'left', 'right', 'interior_odometer', 'other')),
  is_plate_visible boolean not null default false,
  file_size_bytes int not null check (file_size_bytes <= 5242880),
  mime_type text not null,
  uploaded_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table case_photos enable row level security;

create policy case_photos_select on case_photos
  for select to authenticated
  using (
    exists (
      select 1 from cases c
      where c.id = case_photos.case_id
        and (
          (current_profile_role() = 'sales_officer' and c.sales_officer_id = auth.uid())
          or (current_profile_role() = 'purchase_officer' and c.assigned_po_id = auth.uid())
          or (current_profile_role() = 'manager' and (current_profile_is_group_manager() or c.branch_id = current_profile_branch()))
        )
    )
  );

create policy case_photos_insert_so on case_photos
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from cases c
      where c.id = case_photos.case_id
        and c.sales_officer_id = auth.uid()
        and c.status = 'draft'
    )
  );

create policy case_photos_delete_so on case_photos
  for delete to authenticated
  using (
    exists (
      select 1 from cases c
      where c.id = case_photos.case_id
        and c.sales_officer_id = auth.uid()
        and c.status = 'draft'
    )
  );

-- =========================================================================
-- case_ref_counters (atomic per-branch, per-month sequence for case_ref)
-- =========================================================================
create table case_ref_counters (
  branch_id uuid not null references branches (id),
  yyyymm text not null,
  next_seq int not null default 1,
  primary key (branch_id, yyyymm)
);

alter table case_ref_counters enable row level security;
-- No policies: only the submit_case_for_evaluation() function (security definer) touches this table.

-- =========================================================================
-- case_events (audit trail)
-- =========================================================================
create table case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases (id) on delete cascade,
  event_type text not null,
  actor_id uuid,
  actor_role text,
  notes text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table case_events enable row level security;

create policy case_events_select on case_events
  for select to authenticated
  using (
    exists (
      select 1 from cases c
      where c.id = case_events.case_id
        and (
          (current_profile_role() = 'sales_officer' and c.sales_officer_id = auth.uid())
          or (current_profile_role() = 'purchase_officer' and c.assigned_po_id = auth.uid())
          or (current_profile_role() = 'manager' and (current_profile_is_group_manager() or c.branch_id = current_profile_branch()))
        )
    )
  );
-- No insert policy: only RPCs (security definer) write audit events.

-- =========================================================================
-- submit_case_for_evaluation: draft -> pending_evaluation
-- Validates required fields, generates case_ref, round-robin assigns a PO,
-- and logs an audit event -- all atomically.
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
     or v_case.model is null or v_case.variant is null
     or v_case.registration_year is null or v_case.fuel_type is null
     or v_case.transmission is null or v_case.odometer_km is null
     or v_case.has_loan is null or v_case.customer_expected_price is null then
    raise exception 'Case is missing required fields';
  end if;

  if (select count(*) from case_photos where case_id = p_case_id) < 6 then
    raise exception 'At least 6 photos are required';
  end if;

  -- Generate case_ref: UT-<BRANCHCODE>-<YYYYMM>-<seq>
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
-- withdraw_case: draft or pending_evaluation -> withdrawn
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

  if p_reason is null or trim(p_reason) = '' then
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

revoke execute on function withdraw_case(uuid, text) from public, anon;
grant execute on function withdraw_case(uuid, text) to authenticated;

-- =========================================================================
-- Storage: private bucket for vehicle photos
-- =========================================================================
insert into storage.buckets (id, name, public)
values ('vehicle-photos', 'vehicle-photos', false)
on conflict (id) do nothing;

-- Path convention: vehicle-photos/{case_id}/{photo_uuid}.{ext}
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

-- No SELECT policy on storage.objects for anyone: all reads happen through a
-- server-side signed-URL route that applies its own authorization (and, for
-- brokers in Phase 5, plate-masking) logic before minting a URL.
