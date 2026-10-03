-- Phase 7 hardening: add indexes for every foreign key the advisor flagged,
-- and rewrite RLS policies so auth.uid()/helper-function calls are wrapped in
-- `(select ...)`, which Postgres can evaluate once per query instead of once
-- per row. Also consolidates cases/profiles SELECT into a single policy each
-- (multiple permissive policies for the same role+action all get evaluated).
-- No behavioral change -- same access rules, just cheaper to evaluate at scale.

-- =========================================================================
-- Missing indexes
-- =========================================================================
create index if not exists idx_case_events_case_id on case_events (case_id);
create index if not exists idx_case_offers_purchase_officer_id on case_offers (purchase_officer_id);
create index if not exists idx_case_photos_case_id on case_photos (case_id);
create index if not exists idx_case_photos_uploaded_by on case_photos (uploaded_by);
create index if not exists idx_cases_assigned_po_id on cases (assigned_po_id);
create index if not exists idx_cases_branch_id on cases (branch_id);
create index if not exists idx_cases_closed_by on cases (closed_by);
create index if not exists idx_cases_customer_decision_by on cases (customer_decision_by);
create index if not exists idx_cases_sales_officer_id on cases (sales_officer_id);
create index if not exists idx_profiles_branch_id on profiles (branch_id);

-- =========================================================================
-- profiles: consolidate 2 SELECT policies into 1, wrap auth calls
-- =========================================================================
drop policy profiles_select_self on profiles;
drop policy profiles_select_manager on profiles;

create policy profiles_select on profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (
      (select current_profile_role()) = 'manager'
      and ((select current_profile_is_group_manager()) or branch_id = (select current_profile_branch()))
    )
  );

drop policy profiles_insert_self_staff on profiles;
create policy profiles_insert_self_staff on profiles
  for insert to authenticated
  with check (
    id = (select auth.uid())
    and role in ('sales_officer', 'purchase_officer')
  );

-- =========================================================================
-- brokers
-- =========================================================================
drop policy brokers_insert_self on brokers;
create policy brokers_insert_self on brokers
  for insert to authenticated
  with check (id = (select auth.uid()) and status = 'pending');

drop policy brokers_select_self on brokers;
create policy brokers_select_self on brokers
  for select to authenticated
  using (id = (select auth.uid()));

-- =========================================================================
-- cases: consolidate 3 SELECT policies into 1, wrap auth calls
-- =========================================================================
drop policy cases_select_so on cases;
drop policy cases_select_po on cases;
drop policy cases_select_manager on cases;

create policy cases_select on cases
  for select to authenticated
  using (
    ((select current_profile_role()) = 'sales_officer' and sales_officer_id = (select auth.uid()))
    or ((select current_profile_role()) = 'purchase_officer' and assigned_po_id = (select auth.uid()))
    or (
      (select current_profile_role()) = 'manager'
      and ((select current_profile_is_group_manager()) or branch_id = (select current_profile_branch()))
    )
  );

drop policy cases_insert_so on cases;
create policy cases_insert_so on cases
  for insert to authenticated
  with check (
    (select current_profile_role()) = 'sales_officer'
    and sales_officer_id = (select auth.uid())
    and branch_id = (select current_profile_branch())
    and status = 'draft'
  );

drop policy cases_update_so_draft on cases;
create policy cases_update_so_draft on cases
  for update to authenticated
  using ((select current_profile_role()) = 'sales_officer' and sales_officer_id = (select auth.uid()) and status = 'draft')
  with check ((select current_profile_role()) = 'sales_officer' and sales_officer_id = (select auth.uid()) and status = 'draft');

drop policy cases_delete_so_draft on cases;
create policy cases_delete_so_draft on cases
  for delete to authenticated
  using ((select current_profile_role()) = 'sales_officer' and sales_officer_id = (select auth.uid()) and status = 'draft');

-- =========================================================================
-- case_photos
-- =========================================================================
drop policy case_photos_select on case_photos;
create policy case_photos_select on case_photos
  for select to authenticated
  using (
    exists (
      select 1 from cases c
      where c.id = case_photos.case_id
        and (
          ((select current_profile_role()) = 'sales_officer' and c.sales_officer_id = (select auth.uid()))
          or ((select current_profile_role()) = 'purchase_officer' and c.assigned_po_id = (select auth.uid()))
          or ((select current_profile_role()) = 'manager' and ((select current_profile_is_group_manager()) or c.branch_id = (select current_profile_branch())))
        )
    )
  );

drop policy case_photos_insert_so on case_photos;
create policy case_photos_insert_so on case_photos
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (
      select 1 from cases c
      where c.id = case_photos.case_id
        and c.sales_officer_id = (select auth.uid())
        and c.status = 'draft'
    )
  );

drop policy case_photos_delete_so on case_photos;
create policy case_photos_delete_so on case_photos
  for delete to authenticated
  using (
    exists (
      select 1 from cases c
      where c.id = case_photos.case_id
        and c.sales_officer_id = (select auth.uid())
        and c.status = 'draft'
    )
  );

-- =========================================================================
-- case_events
-- =========================================================================
drop policy case_events_select on case_events;
create policy case_events_select on case_events
  for select to authenticated
  using (
    exists (
      select 1 from cases c
      where c.id = case_events.case_id
        and (
          ((select current_profile_role()) = 'sales_officer' and c.sales_officer_id = (select auth.uid()))
          or ((select current_profile_role()) = 'purchase_officer' and c.assigned_po_id = (select auth.uid()))
          or ((select current_profile_role()) = 'manager' and ((select current_profile_is_group_manager()) or c.branch_id = (select current_profile_branch())))
        )
    )
  );

-- =========================================================================
-- case_offers
-- =========================================================================
drop policy case_offers_select on case_offers;
create policy case_offers_select on case_offers
  for select to authenticated
  using (
    exists (
      select 1 from cases c
      where c.id = case_offers.case_id
        and (
          ((select current_profile_role()) = 'sales_officer' and c.sales_officer_id = (select auth.uid()))
          or ((select current_profile_role()) = 'purchase_officer' and c.assigned_po_id = (select auth.uid()))
          or ((select current_profile_role()) = 'manager' and ((select current_profile_is_group_manager()) or c.branch_id = (select current_profile_branch())))
        )
    )
  );
