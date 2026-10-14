-- Replaces the automatic round-robin PO assignment with a manual PTL step:
-- submit_case_for_evaluation() now parks a submitted case at
-- 'pending_assignment' (unassigned) instead of picking a PO itself, and a
-- new ptl_assign_po() lets the branch's PTL hand it to whichever PO they see
-- is free. Reassignment to a different PO is allowed any time before that
-- PO submits an evaluation (case_offers row / status moves past
-- pending_evaluation), e.g. if the first PO goes on leave.

-- =========================================================================
-- 1. submit_case_for_evaluation: no more round-robin. Requires at least one
--    active PTL to cover the branch, otherwise there would be nobody able
--    to ever assign the case to a PO.
-- =========================================================================
create or replace function submit_case_for_evaluation(p_case_id uuid)
returns cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case cases;
  v_branch_code text;
  v_yyyymm text;
  v_seq int;
begin
  select * into v_case from cases where id = p_case_id for update;

  if v_case is null then
    raise exception 'Case not found';
  end if;

  if v_case.sales_officer_id != auth.uid() then
    raise exception 'Not authorized to submit this case';
  end if;

  if v_case.status != 'draft' then
    raise exception 'Case is not in draft status';
  end if;

  if v_case.customer_name is null or v_case.customer_mobile is null
     or v_case.vehicle_reg_number is null or v_case.make is null
     or v_case.model is null
     or v_case.fuel_type is null
     or v_case.transmission is null or v_case.odometer_km is null
     or v_case.has_loan is null then
    raise exception 'Case is missing required fields';
  end if;

  if not exists (
    select 1 from ptl_branches pb
    join profiles p on p.id = pb.ptl_id
    where pb.branch_id = v_case.branch_id and p.role = 'ptl' and p.is_active
  ) then
    raise exception 'No active PTL covers this branch yet';
  end if;

  select code into v_branch_code from branches where id = v_case.branch_id;
  v_yyyymm := to_char(now(), 'YYYYMM');

  insert into case_ref_counters (branch_id, yyyymm, next_seq)
  values (v_case.branch_id, v_yyyymm, 2)
  on conflict (branch_id, yyyymm) do update set next_seq = case_ref_counters.next_seq + 1
  returning next_seq - 1 into v_seq;

  update cases
  set status = 'pending_assignment',
      case_ref = 'UT-' || v_branch_code || '-' || v_yyyymm || '-' || lpad(v_seq::text, 4, '0'),
      submitted_at = now()
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role, metadata)
  values (p_case_id, 'submitted_for_evaluation', auth.uid(), 'sales_officer', jsonb_build_object('status', 'pending_assignment'));

  return v_case;
end;
$$;

-- =========================================================================
-- 2. ptl_assign_po: the PTL's manual assignment/reassignment action.
-- =========================================================================
create or replace function ptl_assign_po(p_case_id uuid, p_po_id uuid)
returns cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case cases;
  v_po profiles;
  v_previous_po_id uuid;
  v_event_type text;
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'ptl' and is_active) then
    raise exception 'Active PTL required';
  end if;

  select * into v_case from cases where id = p_case_id for update;

  if v_case is null then
    raise exception 'Case not found';
  end if;

  if not exists(select 1 from ptl_branches where ptl_id = auth.uid() and branch_id = v_case.branch_id) then
    raise exception 'Not authorized to assign cases for this branch';
  end if;

  if v_case.status not in ('pending_assignment', 'pending_evaluation') then
    raise exception 'Case is not awaiting PO assignment';
  end if;

  select * into v_po from profiles where id = p_po_id;

  if v_po is null or v_po.role != 'purchase_officer' or v_po.is_active is not true or v_po.branch_id != v_case.branch_id then
    raise exception 'Target Purchase Officer is not active in this branch';
  end if;

  v_previous_po_id := v_case.assigned_po_id;
  v_event_type := case when v_previous_po_id is null then 'po_assigned' else 'po_reassigned' end;

  update profiles set last_assigned_at = now() where id = p_po_id;

  update cases
  set assigned_po_id = p_po_id,
      status = 'pending_evaluation'
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role, metadata)
  values (p_case_id, v_event_type, auth.uid(), 'ptl', jsonb_build_object('po_id', p_po_id, 'previous_po_id', v_previous_po_id));

  return v_case;
end;
$$;

revoke execute on function ptl_assign_po(uuid, uuid) from public, anon;
grant execute on function ptl_assign_po(uuid, uuid) to authenticated;

-- =========================================================================
-- 3. withdraw_case: a case can now also sit at pending_assignment, and the
--    SO should still be able to withdraw it from there (e.g. duplicate
--    entry, customer backed out before anyone even picked it up).
-- =========================================================================
create or replace function withdraw_case(p_case_id uuid, p_reason text)
returns cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case cases;
begin
  select * into v_case from cases where id = p_case_id for update;

  if v_case is null then
    raise exception 'Case not found';
  end if;

  if v_case.sales_officer_id != auth.uid() then
    raise exception 'Not authorized to withdraw this case';
  end if;

  if v_case.status not in ('draft', 'pending_assignment', 'pending_evaluation', 'pending_customer_decision') then
    raise exception 'Case cannot be withdrawn from its current status';
  end if;

  if p_reason is null or trim(both E' \t\n\r' from p_reason) = '' then
    raise exception 'A withdrawal reason is required';
  end if;

  update cases
  set status = 'withdrawn', withdrawn_at = now(), withdrawn_reason = p_reason
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role, notes)
  values (p_case_id, 'case_withdrawn', auth.uid(), 'sales_officer', p_reason);

  return v_case;
end;
$$;

-- =========================================================================
-- 4. ptl_dashboard: unassigned queue across every branch the PTL covers,
--    plus each PO's open-case count as the "who's free" signal.
-- =========================================================================
create or replace function ptl_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'ptl' and is_active) then
    raise exception 'Active PTL required';
  end if;

  select jsonb_build_object(
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'code', b.code) order by b.name)
      from ptl_branches pb join branches b on b.id = pb.branch_id
      where pb.ptl_id = auth.uid()
    ), '[]'::jsonb),
    'unassigned', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'case_ref', c.case_ref, 'branch_id', c.branch_id, 'branch_name', b.name,
        'make', c.make, 'model', c.model, 'variant', c.variant,
        'customer_name', c.customer_name, 'customer_expected_price', c.customer_expected_price,
        'so_name', so.full_name, 'so_employee_id', so.employee_id, 'submitted_at', c.submitted_at
      ) order by c.submitted_at nulls last)
      from cases c
      join branches b on b.id = c.branch_id
      left join profiles so on so.id = c.sales_officer_id
      where c.status = 'pending_assignment'
        and c.branch_id in (select branch_id from ptl_branches where ptl_id = auth.uid())
    ), '[]'::jsonb),
    'po_workload', coalesce((
      select jsonb_agg(jsonb_build_object(
        'po_id', p.id, 'po_name', p.full_name, 'po_employee_id', p.employee_id,
        'branch_id', p.branch_id, 'branch_name', b.name,
        'open_case_count', (select count(*) from cases c2 where c2.assigned_po_id = p.id and c2.status = 'pending_evaluation'),
        'last_assigned_at', p.last_assigned_at
      ) order by b.name, p.full_name)
      from profiles p
      join branches b on b.id = p.branch_id
      where p.role = 'purchase_officer' and p.is_active
        and p.branch_id in (select branch_id from ptl_branches where ptl_id = auth.uid())
    ), '[]'::jsonb)
  ) into result;

  return result;
end $$;

-- =========================================================================
-- 5. ptl_cases / ptl_case: branch-scoped case list + detail, same
--    "latest-negotiated-price" fix as 0052 (computed columns don't collide
--    with c.*'s own column names). Unlike po_manager_cases, unassigned
--    (pending_assignment) cases are included -- that's the whole point of
--    the list for a PTL.
-- =========================================================================
create or replace function ptl_cases(p_branch uuid default null, p_status text default null, p_search text default '', p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'ptl' and is_active) then
    raise exception 'Active PTL required';
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
    where c.branch_id in (select branch_id from ptl_branches where ptl_id = auth.uid())
      and c.status != 'draft'
      and (p_branch is null or c.branch_id = p_branch)
      and (p_status is null or c.status::text = p_status)
      and concat_ws(' ', c.case_ref, c.make, c.model, c.vehicle_reg_number, so.full_name, c.customer_name) ilike '%' || left(coalesce(p_search, ''), 100) || '%'
  ), paged as (
    select * from scoped
    order by (status = 'pending_assignment') desc, submitted_at desc nulls last, id
    limit 20 offset greatest(0, least(10000, coalesce(p_page, 0))) * 20
  )
  select jsonb_build_object(
    'total', (select count(*) from scoped),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'case_ref', s.case_ref, 'branch_id', s.branch_id, 'branch_name', s.branch_name,
      'po_id', s.assigned_po_id, 'po_name', s.po_name, 'po_employee_id', s.po_employee_id,
      'so_name', s.so_name, 'so_employee_id', s.so_employee_id, 'vehicle_reg_number', s.vehicle_reg_number,
      'customer_name', s.customer_name, 'customer_expected_price', s.current_expected_price,
      'make', s.make, 'model', s.model, 'variant', s.variant, 'status', s.status,
      'offer_price', s.current_offer_price, 'submitted_at', s.submitted_at, 'evaluation_started_at', s.evaluation_started_at
    )), '[]'::jsonb)
  ) into result from paged s;
  return result;
end $$;

create or replace function ptl_case(p_case_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'ptl' and is_active) then
    raise exception 'Active PTL required';
  end if;
  select jsonb_build_object(
    'id', c.id, 'case_ref', c.case_ref, 'status', c.status, 'branch_id', c.branch_id, 'branch_name', b.name,
    'sales_officer_name', so.full_name, 'sales_officer_employee_id', so.employee_id,
    'po_id', c.assigned_po_id, 'po_name', po.full_name, 'po_employee_id', po.employee_id,
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
  where c.id = p_case_id and c.branch_id in (select branch_id from ptl_branches where ptl_id = auth.uid());
  if result is null then raise exception 'Case not found'; end if;
  return result;
end $$;

-- =========================================================================
-- 6. ptl_branch_pos: active POs in a branch the PTL covers, with workload --
--    backs the "assign to" dropdown on the case detail page.
-- =========================================================================
create or replace function ptl_branch_pos(p_branch_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'ptl' and is_active) then
    raise exception 'Active PTL required';
  end if;
  if not exists(select 1 from ptl_branches where ptl_id = auth.uid() and branch_id = p_branch_id) then
    raise exception 'Not authorized for this branch';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'employee_id', p.employee_id,
    'open_case_count', (select count(*) from cases c2 where c2.assigned_po_id = p.id and c2.status = 'pending_evaluation')
  ) order by p.full_name), '[]'::jsonb) into result
  from profiles p
  where p.role = 'purchase_officer' and p.is_active and p.branch_id = p_branch_id;
  return result;
end $$;

revoke execute on function ptl_dashboard(), ptl_cases(uuid, text, text, integer), ptl_case(uuid), ptl_branch_pos(uuid) from public, anon;
grant execute on function ptl_dashboard(), ptl_cases(uuid, text, text, integer), ptl_case(uuid), ptl_branch_pos(uuid) to authenticated;
