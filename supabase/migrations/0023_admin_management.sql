-- Admin role: full account management (staff + brokers) and broker approval,
-- strictly separate from case/business data, which stays owned by the
-- Manager family. Broker approval moves from Group Manager to Admin entirely;
-- Group Manager keeps read-only Broker Performance reporting only.

alter table profiles drop constraint profiles_role_scope_check;
alter table profiles add constraint profiles_role_scope_check check (
  case role
    when 'sales_officer' then branch_id is not null and cluster_id is null
    when 'purchase_officer' then branch_id is not null and cluster_id is null
    when 'sales_manager' then branch_id is not null and cluster_id is null
    when 'manager' then branch_id is not null and cluster_id is null
    when 'cluster_manager' then branch_id is null and cluster_id is not null
    when 'po_manager' then branch_id is null and cluster_id is null
    when 'admin' then branch_id is null and cluster_id is null
  end
);

create or replace function is_active_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select current_profile_role() = 'admin' and exists(select 1 from profiles where id = auth.uid() and is_active) $$;

-- Admin needs to see every staff account, unscoped, to manage them.
drop policy profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated using (
  id = (select auth.uid())
  or manager_branch_access(branch_id)
  or is_active_admin()
);

-- Broker read access for account management moves from Group Manager to Admin.
drop policy brokers_manager_read on brokers;
create policy brokers_admin_read on brokers for select to authenticated using (is_active_admin());

drop policy broker_admin_read on broker_admin_events;
create policy broker_admin_read on broker_admin_events for select to authenticated using (is_active_admin());

-- Broker approve/reject/suspend/reactivate: same function, authority moved to Admin.
create or replace function manage_broker(p_broker_id uuid, p_action text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare b brokers; r record;
begin
  if not is_active_admin() then raise exception 'Active admin required'; end if;
  if p_reason is null or trim(p_reason)='' or length(p_reason)>2000 then raise exception 'A reason is required (maximum 2000 characters)'; end if;
  perform pg_advisory_xact_lock(87210012);
  select * into b from brokers where id=p_broker_id for update;
  if b.id is null or exists(select 1 from profiles where id=b.id) then raise exception 'Broker not found or identity conflicts with a staff account'; end if;
  if p_action='approve' and b.status in ('pending','rejected') then
    update brokers set status='approved',approved_at=clock_timestamp(),approved_by=auth.uid()::text,suspended_at=null where id=b.id;
  elsif p_action='reject' and b.status='pending' then
    update brokers set status='rejected' where id=b.id;
  elsif p_action='suspend' and b.status='approved' and b.suspended_at is null then
    update brokers set suspended_at=clock_timestamp() where id=b.id;
    for r in select c.id from cases c where exists(select 1 from broker_reservations br where br.case_id=c.id and br.broker_id=b.id and br.status='active') order by c.id for update
    loop
      perform marketplace_expire_case(r.id);
      perform marketplace_finish_hold(br.id,'released','Broker suspended') from broker_reservations br where br.case_id=r.id and br.status='active' and br.broker_id=b.id;
    end loop;
    update broker_offers set status='withdrawn' where broker_id=b.id and status<>'closed';
  elsif p_action='reactivate' and b.status='approved' and b.suspended_at is not null then
    update brokers set suspended_at=null where id=b.id;
  else raise exception 'Broker status changed or action is invalid'; end if;
  update brokers set status_reason=trim(p_reason),status_changed_at=clock_timestamp(),status_changed_by=auth.uid() where id=b.id;
  insert into broker_admin_events(broker_id,actor_id,action,reason) values(b.id,auth.uid(),p_action,trim(p_reason));
end $$;

-- Audit trail for Admin's own account-management actions.
create table admin_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references profiles(id),
  action text not null,
  target_type text not null check (target_type in ('profile','broker')),
  target_id uuid not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table admin_events enable row level security;
create policy admin_events_select on admin_events for select to authenticated using (is_active_admin());
create index idx_admin_events_target on admin_events (target_type, target_id);

create function admin_set_profile_active(p_profile_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_target profiles;
begin
  if not is_active_admin() then raise exception 'Active admin required'; end if;
  if p_profile_id = auth.uid() and not p_active then raise exception 'Cannot deactivate your own account'; end if;
  select * into v_target from profiles where id = p_profile_id for update;
  if v_target.id is null then raise exception 'Account not found'; end if;
  update profiles set is_active = p_active where id = p_profile_id;
  insert into admin_events(actor_id, action, target_type, target_id, metadata)
    values(auth.uid(), case when p_active then 'profile_activated' else 'profile_deactivated' end, 'profile', p_profile_id,
      jsonb_build_object('employee_id', v_target.employee_id, 'role', v_target.role));
end $$;

create function admin_reassign_profile(
  p_profile_id uuid,
  p_role app_role,
  p_branch_id uuid default null,
  p_cluster_id uuid default null,
  p_is_group_manager boolean default false,
  p_full_name text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_target profiles;
begin
  if not is_active_admin() then raise exception 'Active admin required'; end if;
  select * into v_target from profiles where id = p_profile_id for update;
  if v_target.id is null then raise exception 'Account not found'; end if;
  update profiles set
    role = p_role,
    branch_id = p_branch_id,
    cluster_id = p_cluster_id,
    is_group_manager = coalesce(p_is_group_manager, false),
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name)
  where id = p_profile_id;
  insert into admin_events(actor_id, action, target_type, target_id, metadata)
    values(auth.uid(), 'profile_reassigned', 'profile', p_profile_id,
      jsonb_build_object('from_role', v_target.role, 'to_role', p_role, 'branch_id', p_branch_id, 'cluster_id', p_cluster_id));
end $$;

create function admin_dashboard_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not is_active_admin() then raise exception 'Active admin required'; end if;
  select jsonb_build_object(
    'staff_by_role', (select coalesce(jsonb_object_agg(role, cnt), '{}') from (select role::text role, count(*) cnt from profiles group by role) s),
    'staff_active', (select count(*) from profiles where is_active),
    'staff_inactive', (select count(*) from profiles where not is_active),
    'brokers_pending', (select count(*) from brokers where status = 'pending'),
    'brokers_approved', (select count(*) from brokers where status = 'approved' and suspended_at is null),
    'brokers_suspended', (select count(*) from brokers where suspended_at is not null),
    'brokers_rejected', (select count(*) from brokers where status = 'rejected')
  ) into result;
  return result;
end $$;

revoke all on function is_active_admin(), admin_set_profile_active(uuid, boolean), admin_reassign_profile(uuid, app_role, uuid, uuid, boolean, text), admin_dashboard_summary() from public, anon;
grant execute on function is_active_admin(), admin_set_profile_active(uuid, boolean), admin_reassign_profile(uuid, app_role, uuid, uuid, boolean, text), admin_dashboard_summary() to authenticated;
