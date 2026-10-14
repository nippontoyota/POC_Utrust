-- PTL coverage is many-to-many: one PTL can cover several branches (e.g. the
-- Thrissur PTL also covers two branches that don't exist as their own PTL
-- yet, plus a sister branch), unlike Sales Manager's single branch_id. So a
-- PTL's own profiles row stays scope-less (branch_id/cluster_id both null,
-- same shape as po_manager/broker_coordinator/ceo) and the actual branch
-- coverage lives in this join table instead.
create table ptl_branches (
  ptl_id uuid not null references profiles (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ptl_id, branch_id)
);

alter table ptl_branches enable row level security;

-- Only the owner-provisioning script (service role, bypasses RLS) ever
-- writes this table -- no insert/update/delete policy needed, same as how
-- profiles.role itself has no client-writable path.
create policy ptl_branches_select_own on ptl_branches for select to authenticated
  using (ptl_id = auth.uid());

alter table profiles drop constraint profiles_role_scope_check;
alter table profiles add constraint profiles_role_scope_check check (
  case role
    when 'sales_officer' then (branch_id is not null and cluster_id is null)
    when 'purchase_officer' then (branch_id is not null and cluster_id is null)
    when 'sales_manager' then (branch_id is not null and cluster_id is null)
    when 'cluster_manager' then (branch_id is null and cluster_id is not null)
    when 'po_manager' then (branch_id is null and cluster_id is null)
    when 'admin' then (branch_id is null and cluster_id is null)
    when 'broker_coordinator' then (branch_id is null and cluster_id is null)
    when 'ceo' then (branch_id is null and cluster_id is null)
    when 'ptl' then (branch_id is null and cluster_id is null)
  end
);

-- Extend the one function that feeds case_photos/case_events/case_offers/
-- case_negotiations select policies so a PTL can see those for any case in
-- a branch they cover (needed for the case detail page's photo gallery,
-- activity log, and offer/negotiation view).
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
      or (current_profile_role() = 'ptl' and exists(
        select 1 from ptl_branches pb where pb.ptl_id = auth.uid() and pb.branch_id = c.branch_id
      ))
    )
  )
$$;
