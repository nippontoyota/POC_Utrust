-- Fix: 0051 added a computed column aliased customer_expected_price inside
-- the same SELECT as `c.*`, which already carries a column of that exact
-- name from the cases table -- Postgres allows the duplicate name in the
-- CTE's own output, but every downstream reference to it (paged, the final
-- jsonb_build_object) became ambiguous, breaking the whole query. Rename
-- the computed column so it no longer collides with `c.*`.
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
      coalesce(
        c.final_price,
        (select n.amount from case_negotiations n where n.case_id = c.id and n.direction = 'nippon_revised' order by n.round desc limit 1),
        o.offer_price
      ) current_offer_price,
      coalesce(
        (select n.amount from case_negotiations n where n.case_id = c.id and n.direction = 'customer_counter' order by n.round desc limit 1),
        c.customer_expected_price
      ) current_expected_price,
      o.submitted_at offer_submitted_at
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
      'customer_name', s.customer_name, 'customer_expected_price', s.current_expected_price,
      'make', s.make, 'model', s.model, 'variant', s.variant, 'status', s.status,
      'offer_price', s.current_offer_price, 'submitted_at', s.submitted_at, 'evaluation_started_at', s.evaluation_started_at
    )), '[]')
  ) into result from paged s;
  return result;
end $$;
