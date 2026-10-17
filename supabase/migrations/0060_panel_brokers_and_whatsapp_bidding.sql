-- =============================================================================
-- Migration 0060: Panel Brokers & WhatsApp Bidding Integration
--
-- 1. Adds broadcast tracking columns to cases (strictly one-time broadcast)
-- 2. Creates panel_brokers table seeded with designated test brokers (zero-risk)
-- 3. Creates panel_broker_bids table for quotes received via DoubleTick WhatsApp
-- 4. RPCs for PTL broadcast trigger and bids leaderboard retrieval
-- =============================================================================

-- 1. Cases table additions for one-time broadcast
alter table cases
  add column if not exists broker_broadcast_at timestamptz,
  add column if not exists broker_broadcast_by uuid references profiles(id);

-- 2. panel_brokers table
create table if not exists panel_brokers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mobile text unique not null,
  place text not null default 'Kochi',
  branch_code text not null default 'CO01B',
  is_active boolean not null default true,
  is_test boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_panel_brokers_mobile on panel_brokers (mobile);
create index if not exists idx_panel_brokers_active on panel_brokers (is_active);

alter table panel_brokers enable row level security;

create policy panel_brokers_staff_read on panel_brokers
  for select to authenticated
  using (true);

-- 3. panel_broker_bids table
create table if not exists panel_broker_bids (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  panel_broker_id uuid references panel_brokers(id) on delete set null,
  broker_name text not null,
  broker_mobile text not null,
  bid_amount numeric(12, 2) not null check (bid_amount > 0),
  raw_message text not null default '',
  received_at timestamptz not null default now(),
  unique (case_id, broker_mobile)
);

create index if not exists idx_panel_bids_case_desc on panel_broker_bids (case_id, bid_amount desc);

alter table panel_broker_bids enable row level security;

create policy panel_broker_bids_staff_read on panel_broker_bids
  for select to authenticated
  using (true);

-- 4. Seed ONLY the 3 designated test brokers for zero-risk testing
insert into panel_brokers (name, mobile, place, branch_code, is_active, is_test)
values
  ('Shiva', '9995228904', 'Kochi', 'CO01B', true, true),
  ('Dev', '8086186336', 'Kochi', 'CO01B', true, true),
  ('Bharath', '7591986822', 'Kochi', 'CO01B', true, true)
on conflict (mobile) do update set
  name = excluded.name,
  place = excluded.place,
  is_active = true,
  is_test = true;

-- 5. RPC: PTL Broadcast Case to Panel Brokers (One-Time Execution Guard)
create or replace function ptl_broadcast_case_to_panel_brokers(
  p_case_id uuid,
  p_photo_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case cases;
  v_branch branches;
  v_caller profiles;
  v_photos jsonb;
  v_brokers jsonb;
begin
  select * into v_caller from profiles where id = auth.uid() and is_active;
  if v_caller is null or (v_caller.role not in ('ptl', 'admin', 'broker_coordinator')) then
    raise exception 'Unauthorized: active PTL, Broker Coordinator, or Admin required';
  end if;

  select * into v_case from cases where id = p_case_id for update;
  if v_case is null then
    raise exception 'Case not found';
  end if;

  -- Verify PTL covers this branch if role is PTL
  if v_caller.role = 'ptl' and not exists (
    select 1 from ptl_branches where ptl_id = v_caller.id and branch_id = v_case.branch_id
  ) then
    raise exception 'You do not cover this branch';
  end if;

  -- Ensure strictly one-time execution
  if v_case.broker_broadcast_at is not null then
    raise exception 'This vehicle has already been broadcasted to panel brokers on %', v_case.broker_broadcast_at;
  end if;

  -- Verify vehicle is ready for broker listing
  if v_case.status not in ('listed_for_brokers', 'broker_offer_selected') and v_case.broker_consent is not true then
    raise exception 'Vehicle is not in broker listing status';
  end if;

  select * into v_branch from branches where id = v_case.branch_id;

  -- Stamp broadcast timestamp, status, and user
  update cases
  set status = 'listed_for_brokers',
      broker_broadcast_at = now(),
      broker_broadcast_by = v_caller.id
  where id = p_case_id;

  -- Record audit event
  insert into case_events (case_id, event_type, actor_id, actor_role, metadata, notes)
  values (
    p_case_id,
    'panel_broker_broadcast_sent',
    v_caller.id,
    v_caller.role::text,
    jsonb_build_object(
      'broadcast_at', now(),
      'branch_name', v_branch.name,
      'branch_code', v_branch.code
    ),
    'WhatsApp broadcast sent to panel brokers'
  );

  -- Fetch approved photos: if specific photo IDs were reviewed and approved by PTL, use those;
  -- otherwise fall back to first 4 plate-hidden photos.
  if p_photo_ids is not null and array_length(p_photo_ids, 1) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', ph.id,
      'category', ph.category,
      'storage_path', ph.storage_path
    )), '[]'::jsonb)
    into v_photos
    from (
      select id, category, storage_path
      from case_photos
      where id = any(p_photo_ids)
        and case_id = p_case_id
        and category <> 'rc_book'
      order by case when category = 'interior_odometer' then 1 else 2 end, created_at
    ) ph;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', ph.id,
      'category', ph.category,
      'storage_path', ph.storage_path
    )), '[]'::jsonb)
    into v_photos
    from (
      select id, category, storage_path
      from case_photos
      where case_id = p_case_id
        and (not is_plate_visible or is_plate_visible is null)
        and category <> 'rc_book'
      order by case when category = 'interior_odometer' then 1 else 2 end, created_at
      limit 4
    ) ph;
  end if;

  -- Fetch active panel brokers (currently only the safe test numbers)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pb.id,
    'name', pb.name,
    'mobile', pb.mobile,
    'place', pb.place
  )), '[]'::jsonb)
  into v_brokers
  from panel_brokers pb
  where pb.is_active = true;

  return jsonb_build_object(
    'success', true,
    'case_id', v_case.id,
    'case_ref', v_case.case_ref,
    'branch_name', v_branch.name,
    'branch_code', v_branch.code,
    'make', v_case.make,
    'model', v_case.model,
    'variant', v_case.variant,
    'color', v_case.color,
    'registration_year', v_case.registration_year,
    'odometer_km', v_case.odometer_km,
    'ownership_count', v_case.ownership_count,
    'fuel_type', v_case.fuel_type,
    'transmission', v_case.transmission,
    'vehicle_reg_number', v_case.vehicle_reg_number,
    'broadcast_at', now(),
    'photos', v_photos,
    'recipients', v_brokers
  );
end;
$$;

-- 6. RPC: Get Panel Broker Bids (Leaderboard)
create or replace function get_panel_broker_bids(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bids jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'broker_name', b.broker_name,
    'broker_mobile', b.broker_mobile,
    'place', coalesce(pb.place, 'Kochi'),
    'bid_amount', b.bid_amount,
    'raw_message', b.raw_message,
    'received_at', b.received_at
  ) order by b.bid_amount desc, b.received_at asc), '[]'::jsonb)
  into v_bids
  from panel_broker_bids b
  left join panel_brokers pb on pb.id = b.panel_broker_id or pb.mobile = b.broker_mobile
  where b.case_id = p_case_id;

  return v_bids;
end;
$$;

-- 7. RPC: Record Incoming Panel Broker Bid (Called by Webhook)
create or replace function record_panel_broker_bid(
  p_case_id uuid,
  p_mobile text,
  p_bid_amount numeric,
  p_raw_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broker panel_brokers;
  v_bid_id uuid;
  v_existing_id uuid;
  v_existing_amount numeric;
  v_name text;
begin
  if p_bid_amount is null or p_bid_amount <= 0 then
    raise exception 'Invalid bid amount';
  end if;

  -- Enforce single-quote rule: each broker may only submit ONE quote per vehicle
  select id, bid_amount into v_existing_id, v_existing_amount
  from panel_broker_bids
  where case_id = p_case_id and broker_mobile = p_mobile
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'success', false,
      'is_duplicate', true,
      'bid_id', v_existing_id,
      'existing_amount', v_existing_amount
    );
  end if;

  select * into v_broker from panel_brokers where mobile = p_mobile limit 1;
  v_name := coalesce(v_broker.name, 'Broker ' || right(p_mobile, 4));

  insert into panel_broker_bids (
    case_id,
    panel_broker_id,
    broker_name,
    broker_mobile,
    bid_amount,
    raw_message,
    received_at
  )
  values (
    p_case_id,
    v_broker.id,
    v_name,
    p_mobile,
    p_bid_amount,
    coalesce(p_raw_text, ''),
    now()
  )
  returning id into v_bid_id;

  -- Log audit event
  insert into case_events (case_id, event_type, metadata, notes)
  values (
    p_case_id,
    'panel_broker_bid_received',
    jsonb_build_object(
      'broker_name', v_name,
      'broker_mobile', p_mobile,
      'bid_amount', p_bid_amount
    ),
    'Panel broker quote received via WhatsApp'
  );

  return jsonb_build_object('success', true, 'bid_id', v_bid_id);
end;
$$;
