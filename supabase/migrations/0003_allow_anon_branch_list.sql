-- The signup form needs to show a branch dropdown before the user has an
-- authenticated session. Branch code/name is not sensitive.
create policy branches_select_anon on branches
  for select
  to anon
  using (true);
