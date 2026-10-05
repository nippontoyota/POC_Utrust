-- Three new manager sub-types, all strictly read-only like the existing `manager` role:
--   sales_manager    -- one branch, full case detail (same shape as today's branch manager)
--   cluster_manager  -- every branch in one cluster, same full detail, just wider
--   po_manager       -- every branch company-wide, PO-side data only, never customer contact info
--
-- `manager`/`is_group_manager` is untouched and keeps working exactly as before; it is not
-- replaced by this work (a future "sees everything" view is a separate project).

create table clusters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  display_order integer not null,
  created_at timestamptz not null default now()
);

alter table clusters enable row level security;

create policy clusters_select_authenticated on clusters
  for select to authenticated using (true);

insert into clusters (name, display_order) values
  ('Cochin', 1),
  ('Thrissur', 2),
  ('Kottayam', 3),
  ('Trivandrum', 4);

alter table branches add column cluster_id uuid references clusters (id);

update branches set cluster_id = (select id from clusters where name = 'Cochin')
  where name in ('Nettoor', 'Kalamassery', 'Kayamkulam');
update branches set cluster_id = (select id from clusters where name = 'Thrissur')
  where name in ('Thrissur', 'Irinjalakuda', 'Muvattupuzha');
update branches set cluster_id = (select id from clusters where name = 'Kottayam')
  where name in ('Kottayam', 'Pala', 'Thiruvalla', 'Pathanamthitta');
update branches set cluster_id = (select id from clusters where name = 'Trivandrum')
  where name in ('Enchakkal', 'Kazhakootam', 'Kollam');

alter table branches alter column cluster_id set not null;

-- profiles: branch_id becomes optional (cluster_manager/po_manager don't have one),
-- cluster_id is new (only cluster_manager has one). A check constraint keeps every
-- role's scope fields consistent so a bad profile row can never be created.
alter table profiles alter column branch_id drop not null;
alter table profiles add column cluster_id uuid references clusters (id);

alter table profiles add constraint profiles_role_scope_check check (
  case role
    when 'sales_officer' then branch_id is not null and cluster_id is null
    when 'purchase_officer' then branch_id is not null and cluster_id is null
    when 'sales_manager' then branch_id is not null and cluster_id is null
    when 'manager' then branch_id is not null and cluster_id is null
    when 'cluster_manager' then branch_id is null and cluster_id is not null
    when 'po_manager' then branch_id is null and cluster_id is null
  end
);

create or replace function current_profile_cluster() returns uuid
language sql stable security definer set search_path = public as
$$ select cluster_id from profiles where id = auth.uid() $$;

-- Single source of truth for "can the current session, as some manager type, see
-- a case/photo/offer/event belonging to this branch". SECURITY DEFINER so it can
-- be reused inside OTHER tables' policies (case_photos, case_offers, case_events)
-- without those subqueries being re-filtered by cases' own RLS.
create or replace function manager_branch_access(p_branch_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case current_profile_role()
    when 'sales_manager' then p_branch_id = current_profile_branch()
    when 'cluster_manager' then p_branch_id in (select id from branches where cluster_id = current_profile_cluster())
    when 'manager' then current_profile_is_group_manager() or p_branch_id = current_profile_branch()
    when 'po_manager' then true
    else false
  end
$$;

-- po_manager is deliberately NOT included here (nor in cases_select below) --
-- they only ever see cases via the po_manager_* functions further down, which
-- never select customer_name/customer_mobile.
create or replace function manager_case_access(p_case_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from cases c where c.id = p_case_id and (
      (current_profile_role() = 'sales_officer' and c.sales_officer_id = auth.uid())
      or (current_profile_role() = 'purchase_officer' and c.assigned_po_id = auth.uid())
      or manager_branch_access(c.branch_id)
    )
  )
$$;

drop policy cases_select on cases;
create policy cases_select on cases for select to authenticated using (
  ((select current_profile_role()) = 'sales_officer' and sales_officer_id = (select auth.uid()))
  or ((select current_profile_role()) = 'purchase_officer' and assigned_po_id = (select auth.uid()))
  or manager_branch_access(branch_id)
);

drop policy profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated using (
  id = (select auth.uid())
  or manager_branch_access(branch_id)
);

drop policy case_photos_select on case_photos;
create policy case_photos_select on case_photos for select to authenticated using (
  manager_case_access(case_id)
);

drop policy case_offers_select on case_offers;
create policy case_offers_select on case_offers for select to authenticated using (
  manager_case_access(case_id)
);

drop policy case_events_select on case_events;
create policy case_events_select on case_events for select to authenticated using (
  manager_case_access(case_id)
);

-- Broker marketplace visibility for the new scoped managers (read-only, same as
-- today's branch/group manager) -- but NOT the separate Broker Performance /
-- Broker Access screens, which stay exactly as they are (is_group_manager only)
-- pending a future dedicated admin section.
create or replace function marketplace_staff_access(p_case_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select manager_case_access(p_case_id)
$$;

-- po_manager's own narrow, customer-info-free read functions.
create function po_manager_summary() returns jsonb
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

create function po_manager_cases(p_search text default '', p_branch uuid default null, p_status text default null, p_page integer default 0) returns jsonb
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

create function po_manager_case(p_case_id uuid) returns jsonb
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
revoke all on function manager_branch_access(uuid), manager_case_access(uuid), current_profile_cluster() from public, anon;
grant execute on function manager_branch_access(uuid), manager_case_access(uuid), current_profile_cluster() to authenticated;
