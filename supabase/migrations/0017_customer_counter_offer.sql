alter table cases
  add column customer_counter_offer_price numeric(12,2) check (customer_counter_offer_price is null or (customer_counter_offer_price > 0 and customer_counter_offer_price < 10000000000)),
  add column customer_counter_offer_note text check (customer_counter_offer_note is null or length(customer_counter_offer_note) <= 1000),
  add column customer_counter_offer_at timestamptz,
  add column customer_counter_offer_by uuid references profiles(id);

create or replace function record_customer_counter_offer(
  p_case_id uuid,
  p_counter_offer_price numeric,
  p_note text default null
)
returns cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case cases;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into v_case from cases where id = p_case_id for update;

  if v_case is null then
    raise exception 'Case not found';
  end if;

  if v_case.sales_officer_id != auth.uid() then
    raise exception 'Not authorized to record a counter offer on this case';
  end if;

  if v_case.status != 'pending_customer_decision' then
    raise exception 'Case is not awaiting a customer decision';
  end if;

  if p_counter_offer_price is null or p_counter_offer_price <= 0 or p_counter_offer_price >= 10000000000 then
    raise exception 'Enter a valid customer counter offer amount';
  end if;

  update cases
  set customer_counter_offer_price = p_counter_offer_price,
      customer_counter_offer_note = v_note,
      customer_counter_offer_at = now(),
      customer_counter_offer_by = auth.uid()
  where id = p_case_id
  returning * into v_case;

  insert into case_events (case_id, event_type, actor_id, actor_role, metadata, notes)
  values (
    p_case_id,
    'customer_counter_offer_recorded',
    auth.uid(),
    'sales_officer',
    jsonb_build_object('amount', p_counter_offer_price),
    v_note
  );

  return v_case;
end;
$$;

revoke execute on function record_customer_counter_offer(uuid, numeric, text) from public, anon;
grant execute on function record_customer_counter_offer(uuid, numeric, text) to authenticated;
