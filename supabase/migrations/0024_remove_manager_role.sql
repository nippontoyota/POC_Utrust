-- Remove the generic 'manager' role entirely. Sales Manager / Cluster Manager /
-- PO Manager now cover every case the old branch-or-all-branches Manager role
-- did; Cluster Manager picks up its one remaining exclusive capability (broker
-- performance reporting). No profile currently has role = 'manager', so this
-- is a clean cutover with no data to migrate.

-- 1. Drop everything that depends on is_group_manager / role='manager' before
--    the column and enum value disappear underneath them.
drop function if exists marketplace_group_manager();
drop function if exists current_profile_is_group_manager();

-- profiles_insert_self_staff references the role column directly, which
-- blocks the enum swap below; drop it now, recreate it after the swap.
drop policy if exists profiles_insert_self_staff on profiles;

alter table profiles drop constraint if exists profiles_role_scope_check;

-- current_profile_role()'s return type is changing, so it must be dropped and
-- recreated; CASCADE takes the four `cases` policies that call it with it,
-- and they're recreated verbatim afterward.
drop function if exists current_profile_role() cascade;
drop function if exists admin_reassign_profile(uuid, app_role, uuid, uuid, boolean, text);

-- 2. Swap the enum: Postgres can't drop a value from an existing type, so
--    recreate it without 'manager' and repoint the one column that uses it.
create type app_role_new as enum (
  'sales_officer', 'purchase_officer', 'sales_manager', 'cluster_manager', 'po_manager', 'admin'
);

alter table profiles alter column role type app_role_new using role::text::app_role_new;

drop type app_role;
alter type app_role_new rename to app_role;

-- 3. Recreate the functions dropped in step 1 against the new type.
create function current_profile_role()
returns app_role
language sql stable security definer set search_path = public
as $$ select role from profiles where id = auth.uid() $$;

create policy profiles_insert_self_staff on profiles for insert to authenticated
  with check (
    id = auth.uid()
    and role = any (array['sales_officer'::app_role, 'purchase_officer'::app_role])
  );

-- Recreate the four `cases` policies CASCADE just dropped, unchanged.
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
  );

create function admin_reassign_profile(
  p_profile_id uuid, p_role app_role, p_branch_id uuid default null, p_cluster_id uuid default null, p_full_name text default null
)
returns void
language plpgsql security definer set search_path = public
as $function$
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
end $function$;

-- 4. Restore the exhaustive role/scope CHECK without 'manager'.
alter table profiles add constraint profiles_role_scope_check check (
  case role
    when 'sales_officer' then (branch_id is not null and cluster_id is null)
    when 'purchase_officer' then (branch_id is not null and cluster_id is null)
    when 'sales_manager' then (branch_id is not null and cluster_id is null)
    when 'cluster_manager' then (branch_id is null and cluster_id is not null)
    when 'po_manager' then (branch_id is null and cluster_id is null)
    when 'admin' then (branch_id is null and cluster_id is null)
    else null
  end
);

-- 5. manager_branch_access loses its 'manager' branch; sales/cluster manager
--    scoping is unchanged.
create or replace function manager_branch_access(p_branch_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case current_profile_role()
    when 'sales_manager' then p_branch_id = current_profile_branch()
    when 'cluster_manager' then p_branch_id in (select id from branches where cluster_id = current_profile_cluster())
    else false
  end
$$;

-- 6. Broker performance reporting moves from (group) Manager to Cluster
--    Manager, scoped to that manager's own cluster instead of branch/all-branches.
create or replace function broker_report(p_from date default null, p_to date default null, p_branch uuid default null, p_broker uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $function$
declare result jsonb;
begin
  if not exists(select 1 from profiles where id=auth.uid() and role='cluster_manager' and is_active) then raise exception 'Active cluster manager required'; end if;
  if p_from is not null and p_to is not null and p_from>p_to then raise exception 'Start date must precede end date'; end if;
  with scoped as (
    select c.*,b.name branch_name from cases c join branches b on b.id=c.branch_id
    join profiles p on p.id=auth.uid()
    where b.cluster_id = p.cluster_id and (p_branch is null or c.branch_id=p_branch)
      and c.listed_at is not null
      and (p_broker is null or exists(select 1 from broker_offers o where o.case_id=c.id and o.broker_id=p_broker))
  ), reservations as (
    select r.*,b.company_name broker_name from broker_reservations r join scoped c on c.id=r.case_id join brokers b on b.id=r.broker_id
    where p_broker is null or r.broker_id=p_broker
  ), attempts as (
    select * from reservations where (p_from is null or (started_at at time zone 'Asia/Kolkata')::date>=p_from)
      and (p_to is null or (started_at at time zone 'Asia/Kolkata')::date<=p_to)
  ), completed as (
    select * from reservations where status='completed'
      and (p_from is null or (ended_at at time zone 'Asia/Kolkata')::date>=p_from)
      and (p_to is null or (ended_at at time zone 'Asia/Kolkata')::date<=p_to)
  ), cohort as (
    select * from scoped where (p_from is null or (listed_at at time zone 'Asia/Kolkata')::date>=p_from)
      and (p_to is null or (listed_at at time zone 'Asia/Kolkata')::date<=p_to)
  ), performance as (
    select broker_id id,broker_name name,count(*) attempts,
      count(*) filter(where status='completed') completed,
      count(*) filter(where status='expired' or (status='active' and expires_at<=now())) expired,
      count(*) filter(where status='released') released,
      coalesce(sum(amount) filter(where status='completed'),0) value
    from attempts group by broker_id,broker_name
  ), reasons as (
    select case when status='active' and expires_at<=now() then '48-hour deadline elapsed' else coalesce(end_reason,status) end reason,count(*) count
    from attempts where status in ('released','expired') or (status='active' and expires_at<=now()) group by 1
  ), case_rows as (
    select c.id,c.case_ref,c.branch_name,r.broker_name,
      case when c.status='broker_offer_selected' and not exists(select 1 from reservations h where h.case_id=c.id and h.status='active' and h.expires_at>now()) then 'listed_for_brokers' else c.status::text end status,
      case when r.status='active' and r.expires_at>now() then r.expires_at end expires_at
    from cohort c left join lateral (select * from reservations h where h.case_id=c.id order by h.started_at desc limit 1) r on true
    order by c.listed_at desc limit 100
  ) select jsonb_build_object(
    'listed',(select count(*) from scoped c where c.status in ('listed_for_brokers','broker_offer_selected') and c.broker_consent and exists(select 1 from case_photos ph where ph.case_id=c.id and ph.broker_visible)),
    'without_offers',(select count(*) from scoped c where c.status in ('listed_for_brokers','broker_offer_selected') and c.broker_consent
      and exists(select 1 from case_photos ph where ph.case_id=c.id and ph.broker_visible)
      and not exists(select 1 from reservations r where r.case_id=c.id and r.status='active' and r.expires_at>now())
      and (exists(select 1 from reservations r where r.case_id=c.id and r.status='active' and r.expires_at<=now())
        or not exists(select 1 from broker_offers o join brokers b on b.id=o.broker_id where o.case_id=c.id and o.status='current' and b.status='approved' and b.suspended_at is null))),
    'active',(select count(*) from reservations where status='active' and expires_at>now()),
    'expiring',(select count(*) from reservations where status='active' and expires_at>now() and expires_at<=now()+interval '2 hours'),
    'completed',(select count(*) from completed),'deal_value',(select coalesce(sum(amount),0) from completed),
    'cohort_listed',(select count(*) from cohort),
    'cohort_completed',(select count(*) from cohort c where exists(select 1 from reservations r where r.case_id=c.id and r.status='completed')),
    'brokers',(select coalesce(jsonb_agg(to_jsonb(p) order by p.completed desc,p.name),'[]') from performance p),
    'outcomes',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from reasons r),
    'cases',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from case_rows c)
  ) into result;
  return result;
end $function$;

-- 7. is_group_manager has no remaining readers; drop it.
alter table profiles drop column if exists is_group_manager;
