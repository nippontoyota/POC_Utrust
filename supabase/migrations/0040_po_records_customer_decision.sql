-- =========================================================================
-- 0040: Shift record_customer_decision from SO to PO
--
-- The user requested that the SO only sees prices, but the actual customer
-- decision (accept/reject) should be recorded by the Purchase Officer (PO).
-- =========================================================================

create or replace function record_customer_decision(
  p_case_id uuid,
  p_decision customer_decision_type,
  p_broker_consent boolean default null
)
returns cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case cases;
  v_new_status case_status;
begin
  select * into v_case from cases where id = p_case_id for update;

  if v_case is null then
    raise exception 'Case not found';
  end if;

  -- CHANGED: Now checking assigned_po_id instead of sales_officer_id
  if v_case.assigned_po_id is distinct from auth.uid() then
    raise exception 'Only the assigned Purchase Officer can record the customer decision';
  end if;

  if v_case.status != 'pending_customer_decision' then
    raise exception 'Case is not awaiting a customer decision';
  end if;

  if p_decision = 'accepted' then
    v_new_status := 'purchase_completion_pending';
  else
    v_new_status := case when p_broker_consent is true then 'listed_for_brokers' else 'rejected_not_listed' end;
  end if;

  update cases
  set customer_decision = p_decision,
      customer_decision_at = now(),
      customer_decision_by = auth.uid(),
      broker_consent = case when p_decision = 'rejected' then p_broker_consent else null end,
      broker_consent_at = case when p_decision = 'rejected' and p_broker_consent is not null then now() else null end,
      listed_at = case when v_new_status = 'listed_for_brokers' then now() else null end,
      status = v_new_status
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role, metadata)
  values (
    p_case_id,
    'customer_decision_recorded',
    auth.uid(),
    'purchase_officer', -- CHANGED: Role is now purchase_officer
    jsonb_build_object('decision', p_decision, 'broker_consent', p_broker_consent)
  );

  if v_new_status = 'listed_for_brokers' then
    insert into case_events (case_id, event_type, actor_id, actor_role)
    values (p_case_id, 'listed_for_brokers', auth.uid(), 'purchase_officer'); -- CHANGED: Role is now purchase_officer
  end if;

  return v_case;
end;
$$;

revoke execute on function record_customer_decision(uuid, customer_decision_type, boolean) from public, anon;
grant execute on function record_customer_decision(uuid, customer_decision_type, boolean) to authenticated;
