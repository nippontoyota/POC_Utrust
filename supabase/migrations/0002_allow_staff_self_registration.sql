-- SO/PO self-registration: client can insert their own profile row, but only
-- with role in ('sales_officer','purchase_officer') -- never 'manager'. This is
-- the actual enforcement point for "users must not be able to assign themselves
-- a privileged role": Manager can never be set here, no matter what the client sends.
create policy profiles_insert_self_staff on profiles
  for insert
  to authenticated
  with check (
    id = auth.uid()
    and role in ('sales_officer', 'purchase_officer')
  );
