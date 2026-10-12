-- SO's submission is only a starting point, but the PO (and the read-only
-- oversight views) should be able to see WHO filed a case. The existing
-- profiles_select policy only lets a PO/broker_coordinator read their own
-- profile row, so a join to the sales officer's profile silently returns
-- null -- add a policy scoped to exactly the cases each role can already see
-- (cases_select's own scoping), not a blanket "read any profile" grant.

create policy profiles_select_case_so on profiles for select to authenticated
  using (
    exists (
      select 1 from cases c
      where c.sales_officer_id = profiles.id
        and (
          (current_profile_role() = 'purchase_officer' and c.assigned_po_id = auth.uid())
          or (current_profile_role() = 'broker_coordinator' and c.broker_consent is true)
        )
    )
  );

-- po_manager_cases(): add vehicle_reg_number and the sales officer's name so
-- the "All Cases" table can show "Vehicle -- Reg Number" (clickable) plus the
-- Sales Officer, instead of leading with the case ref.
create or replace function po_manager_cases(p_search text default '', p_branch uuid default null, p_status text default null, p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'po_manager' and is_active) then
    raise exception 'Active PO Manager required';
  end if;
  with scoped as (
    select c.*, b.name branch_name, p.full_name po_name, p.employee_id po_employee_id,
      so.full_name so_name, so.employee_id so_employee_id,
      coalesce(c.final_price, o.offer_price) offer_price, o.submitted_at offer_submitted_at
    from cases c
    join branches b on b.id = c.branch_id
    left join profiles p on p.id = c.assigned_po_id
    left join profiles so on so.id = c.sales_officer_id
    left join case_offers o on o.case_id = c.id
    where c.assigned_po_id is not null
      and (p_branch is null or c.branch_id = p_branch)
      and (p_status is null or c.status::text = p_status)
      and concat_ws(' ', c.case_ref, c.make, c.model, c.vehicle_reg_number, so.full_name) ilike '%' || left(coalesce(p_search, ''), 100) || '%'
  ), paged as (
    select * from scoped order by submitted_at desc nulls last, id limit 20 offset greatest(0, least(10000, coalesce(p_page, 0))) * 20
  )
  select jsonb_build_object(
    'total', (select count(*) from scoped),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'case_ref', s.case_ref, 'branch_name', s.branch_name, 'po_name', s.po_name, 'po_employee_id', s.po_employee_id,
      'so_name', s.so_name, 'so_employee_id', s.so_employee_id, 'vehicle_reg_number', s.vehicle_reg_number,
      'make', s.make, 'model', s.model, 'variant', s.variant, 'status', s.status,
      'offer_price', s.offer_price, 'submitted_at', s.submitted_at, 'evaluation_started_at', s.evaluation_started_at
    )), '[]')
  ) into result from paged s;
  return result;
end $$;
