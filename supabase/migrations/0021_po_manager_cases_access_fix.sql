-- Fix: manager_branch_access granted po_manager=true unconditionally, which meant
-- cases_select (reusing that same function) let a PO Manager read customer_name/
-- customer_mobile directly from the `cases` table -- defeating the whole point of
-- routing them through the customer-info-free po_manager_* functions instead.
--
-- po_manager must NEVER gain direct `cases`/`profiles` row access (that's the one
-- table with customer contact info); it only gets case_photos/case_offers/
-- case_events/broker-status visibility, none of which contain customer data.
create or replace function manager_branch_access(p_branch_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case current_profile_role()
    when 'sales_manager' then p_branch_id = current_profile_branch()
    when 'cluster_manager' then p_branch_id in (select id from branches where cluster_id = current_profile_cluster())
    when 'manager' then current_profile_is_group_manager() or p_branch_id = current_profile_branch()
    else false
  end
$$;

create or replace function manager_case_access(p_case_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from cases c where c.id = p_case_id and (
      (current_profile_role() = 'sales_officer' and c.sales_officer_id = auth.uid())
      or (current_profile_role() = 'purchase_officer' and c.assigned_po_id = auth.uid())
      or manager_branch_access(c.branch_id)
      or (current_profile_role() = 'po_manager' and c.assigned_po_id is not null)
    )
  )
$$;
