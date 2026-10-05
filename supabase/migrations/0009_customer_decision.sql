-- Phase 4: customer decision on Nippon's offer, and Nippon-route completion
-- (close / cancel). Broker-route publishing status is set here too (auto-
-- publish on consent), but the marketplace itself is Phase 5.

create type customer_decision_type as enum ('accepted', 'rejected');

alter table cases
  add column customer_decision customer_decision_type,
  add column customer_decision_at timestamptz,
  add column customer_decision_by uuid references profiles (id),
  add column broker_consent boolean,
  add column broker_consent_at timestamptz,
  add column listed_at timestamptz,
  add column closed_at timestamptz,
  add column closed_by uuid references profiles (id),
  add column cancelled_at timestamptz,
  add column cancelled_reason text;

-- =========================================================================
-- record_customer_decision: pending_customer_decision -> (branches)
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

  if v_case.sales_officer_id != auth.uid() then
    raise exception 'Not authorized to record a decision on this case';
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
    'sales_officer',
    jsonb_build_object('decision', p_decision, 'broker_consent', p_broker_consent)
  );

  if v_new_status = 'listed_for_brokers' then
    insert into case_events (case_id, event_type, actor_id, actor_role)
    values (p_case_id, 'listed_for_brokers', auth.uid(), 'sales_officer');
  end if;

  return v_case;
end;
$$;

revoke execute on function record_customer_decision(uuid, customer_decision_type, boolean) from public, anon;
grant execute on function record_customer_decision(uuid, customer_decision_type, boolean) to authenticated;

-- =========================================================================
-- close_case: purchase_completion_pending -> closed (Nippon-direct route)
-- =========================================================================
create or replace function close_case(p_case_id uuid)
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
    raise exception 'Not authorized to close this case';
  end if;

  if v_case.status != 'purchase_completion_pending' then
    raise exception 'Case is not awaiting completion';
  end if;

  update cases
  set status = 'closed', closed_at = now(), closed_by = auth.uid()
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role)
  values (p_case_id, 'case_closed', auth.uid(), 'sales_officer');

  return v_case;
end;
$$;

revoke execute on function close_case(uuid) from public, anon;
grant execute on function close_case(uuid) to authenticated;

-- =========================================================================
-- cancel_case: purchase_completion_pending -> cancelled (reason required)
-- =========================================================================
create or replace function cancel_case(p_case_id uuid, p_reason text)
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
    raise exception 'Not authorized to cancel this case';
  end if;

  if v_case.status != 'purchase_completion_pending' then
    raise exception 'Case is not awaiting completion';
  end if;

  if p_reason is null or trim(both E' \t\n\r' from p_reason) = '' then
    raise exception 'A cancellation reason is required';
  end if;

  update cases
  set status = 'cancelled', cancelled_at = now(), cancelled_reason = p_reason
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role, notes)
  values (p_case_id, 'case_cancelled', auth.uid(), 'sales_officer', p_reason);

  return v_case;
end;
$$;

revoke execute on function cancel_case(uuid, text) from public, anon;
grant execute on function cancel_case(uuid, text) to authenticated;
