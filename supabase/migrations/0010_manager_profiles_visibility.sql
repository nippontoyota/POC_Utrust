-- Manager needs to read SO/PO/Manager profile rows within their scope (e.g.
-- to display "Sales Officer: Jane Doe" on a case). The existing
-- profiles_select_self policy only lets someone see their own row, which
-- silently hid staff names from Manager's case detail view.
create policy profiles_select_manager on profiles
  for select to authenticated
  using (
    current_profile_role() = 'manager'
    and (current_profile_is_group_manager() or branch_id = current_profile_branch())
  );
