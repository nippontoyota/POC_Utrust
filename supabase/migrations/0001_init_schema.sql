-- UTrust POC: Phase 1 foundation schema
-- Roles, branches, brokers, and the helper functions/RLS that everything else builds on.

create extension if not exists "pgcrypto";

create type app_role as enum ('sales_officer', 'purchase_officer', 'manager');
create type broker_status as enum ('pending', 'approved', 'rejected');

-- =========================================================================
-- branches
-- =========================================================================
create table branches (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

alter table branches enable row level security;

-- Every authenticated user needs to read the branch list (signup dropdown, display names).
create policy branches_select_authenticated on branches
  for select
  to authenticated
  using (true);

-- =========================================================================
-- profiles (Sales Officer / Purchase Officer / Manager)
-- =========================================================================
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  employee_id text unique not null,
  full_name text not null,
  role app_role not null,
  branch_id uuid not null references branches (id),
  is_group_manager boolean not null default false,
  is_active boolean not null default true,
  last_assigned_at timestamptz,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- No INSERT/UPDATE/DELETE policy for `authenticated` at all, by design:
--   - SO/PO self-registration is mediated by a server action using the service-role
--     client (see lib/actions/auth.ts), which is the only thing that can ever set `role`.
--     This gives the user the frictionless self-signup UX they asked for, without ever
--     exposing a client-writable path to the `role` column (so no one can grant themselves
--     Manager access by tampering with a request).
--   - Manager accounts are created only by the site owner via scripts/seed-manager.ts,
--     also using the service-role client.
create policy profiles_select_self on profiles
  for select
  to authenticated
  using (id = auth.uid());

-- =========================================================================
-- brokers (separate identity space from staff profiles)
-- =========================================================================
create table brokers (
  id uuid primary key references auth.users (id) on delete cascade,
  company_name text not null,
  contact_name text not null,
  phone text not null,
  email text not null,
  status broker_status not null default 'pending',
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz not null default now()
);

alter table brokers enable row level security;

-- Brokers can self-register (insert their own pending row) and read only their own row.
-- Approval (status -> 'approved') is done by the site owner directly in Supabase Studio,
-- which uses the service role and bypasses RLS entirely, so no UPDATE policy is needed here.
create policy brokers_insert_self on brokers
  for insert
  to authenticated
  with check (id = auth.uid() and status = 'pending');

create policy brokers_select_self on brokers
  for select
  to authenticated
  using (id = auth.uid());

-- =========================================================================
-- Helper functions used by RLS policies on later tables (cases, offers, bids, ...).
-- SECURITY DEFINER so they can read `profiles`/`brokers` without recursing through
-- those tables' own RLS.
-- =========================================================================
create or replace function current_profile_role()
returns app_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create or replace function current_profile_branch()
returns uuid
language sql stable security definer set search_path = public as
$$ select branch_id from profiles where id = auth.uid() $$;

create or replace function current_profile_is_group_manager()
returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(is_group_manager, false) from profiles where id = auth.uid() $$;

create or replace function is_approved_broker()
returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from brokers where id = auth.uid() and status = 'approved') $$;

-- =========================================================================
-- Seed data: branches (adjust/add real branch codes before go-live)
-- =========================================================================
insert into branches (code, name) values
  ('MUM', 'Mumbai'),
  ('PUN', 'Pune'),
  ('DEL', 'Delhi');
