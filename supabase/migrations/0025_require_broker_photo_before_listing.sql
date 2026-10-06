-- An SO could consent to broker listing before approving any photo, which
-- silently produces a case stuck at listed_for_brokers with zero visibility
-- in broker_marketplace() (its has_photos condition is never met). Block
-- that at the source: consenting to broker listing now requires the same
-- "at least one approved, non-plate photo" condition the marketplace itself
-- checks.
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
    if p_broker_consent is true and not exists(
      select 1 from case_photos ph
      where ph.case_id = p_case_id and ph.broker_visible and not ph.is_plate_visible
    ) then
      raise exception 'Approve at least one broker-visible vehicle photo before listing this case to brokers';
    end if;
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
