-- PO Manager was deliberately kept customer-info-free (0021), unlike Sales
-- Manager / Cluster Manager who already see full customer details. Loosened
-- by explicit request: PO Manager can now see customer_name and
-- customer_expected_price (both list and per-case detail) -- customer_mobile
-- stays withheld.

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
      'customer_name', s.customer_name, 'customer_expected_price', s.customer_expected_price,
      'make', s.make, 'model', s.model, 'variant', s.variant, 'status', s.status,
      'offer_price', s.offer_price, 'submitted_at', s.submitted_at, 'evaluation_started_at', s.evaluation_started_at
    )), '[]')
  ) into result from paged s;
  return result;
end $$;

create or replace function po_manager_case(p_case_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'po_manager' and is_active) then
    raise exception 'Active PO Manager required';
  end if;
  select jsonb_build_object(
    'id', c.id, 'case_ref', c.case_ref, 'status', c.status, 'branch_name', b.name,
    'sales_officer_name', so.full_name, 'sales_officer_employee_id', so.employee_id,
    'po_name', po.full_name, 'po_employee_id', po.employee_id,
    'customer_name', c.customer_name, 'customer_expected_price', c.customer_expected_price,
    'vehicle_reg_number', c.vehicle_reg_number, 'make', c.make, 'model', c.model, 'variant', c.variant,
    'registration_year', c.registration_year, 'fuel_type', c.fuel_type, 'transmission', c.transmission,
    'odometer_km', c.odometer_km, 'ownership_count', c.ownership_count,
    'has_loan', c.has_loan, 'lender_note', c.lender_note,
    'created_at', c.created_at, 'submitted_at', c.submitted_at, 'evaluation_started_at', c.evaluation_started_at
  ) into result
  from cases c
  join branches b on b.id = c.branch_id
  left join profiles so on so.id = c.sales_officer_id
  left join profiles po on po.id = c.assigned_po_id
  where c.id = p_case_id and c.assigned_po_id is not null;
  if result is null then raise exception 'Case not found'; end if;
  return result;
end $$;
