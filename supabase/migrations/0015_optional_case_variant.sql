-- Variant is optional for new submissions. Preserve all other submission checks.
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
  v_po_id uuid;
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
     or v_case.registration_year is null or v_case.fuel_type is null
     or v_case.transmission is null or v_case.odometer_km is null
     or v_case.has_loan is null or v_case.customer_expected_price is null then
    raise exception 'Case is missing required fields';
  end if;

  if (select count(*) from case_photos where case_id = p_case_id) < 6 then
    raise exception 'At least 6 photos are required';
  end if;

  -- Generate case_ref: UT-<BRANCHCODE>-<YYYYMM>-<seq>
  select code into v_branch_code from branches where id = v_case.branch_id;
  v_yyyymm := to_char(now(), 'YYYYMM');

  insert into case_ref_counters (branch_id, yyyymm, next_seq)
  values (v_case.branch_id, v_yyyymm, 2)
  on conflict (branch_id, yyyymm) do update set next_seq = case_ref_counters.next_seq + 1
  returning next_seq - 1 into v_seq;

  -- Round-robin PO assignment: the active PO in this branch least recently assigned.
  select id into v_po_id
  from profiles
  where role = 'purchase_officer' and branch_id = v_case.branch_id and is_active = true
  order by last_assigned_at nulls first
  for update skip locked
  limit 1;

  if v_po_id is null then
    raise exception 'No active Purchase Officer available in this branch';
  end if;

  update profiles set last_assigned_at = now() where id = v_po_id;

  update cases
  set status = 'pending_evaluation',
      case_ref = 'UT-' || v_branch_code || '-' || v_yyyymm || '-' || lpad(v_seq::text, 4, '0'),
      assigned_po_id = v_po_id,
      submitted_at = now()
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role, metadata)
  values (p_case_id, 'submitted_for_evaluation', auth.uid(), 'sales_officer', jsonb_build_object('assigned_po_id', v_po_id));

  return v_case;
end;
$$;

revoke execute on function submit_case_for_evaluation(uuid) from public, anon;
grant execute on function submit_case_for_evaluation(uuid) to authenticated;
