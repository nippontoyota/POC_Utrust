-- Broker Coordinator: company-wide scope (branch_id and cluster_id both
-- null), same shape as PO Manager / Admin.
alter table profiles drop constraint profiles_role_scope_check;
alter table profiles add constraint profiles_role_scope_check check (
  case role
    when 'sales_officer' then (branch_id is not null and cluster_id is null)
    when 'purchase_officer' then (branch_id is not null and cluster_id is null)
    when 'sales_manager' then (branch_id is not null and cluster_id is null)
    when 'cluster_manager' then (branch_id is null and cluster_id is not null)
    when 'po_manager' then (branch_id is null and cluster_id is null)
    when 'admin' then (branch_id is null and cluster_id is null)
    when 'broker_coordinator' then (branch_id is null and cluster_id is null)
    else null
  end
);

create function is_active_broker_coordinator()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from profiles where id = auth.uid() and role = 'broker_coordinator' and is_active) $$;

-- case_photos/case_offers/case_events RLS and the staff_broker_case RPC all
-- delegate to this function -- extending it is enough to give Broker
-- Coordinator read access everywhere except the raw cases table (handled
-- separately below, since that one also carries customer PII and has its
-- own inline policy rather than delegating here).
create or replace function manager_case_access(p_case_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from cases c where c.id = p_case_id and (
      (current_profile_role() = 'sales_officer' and c.sales_officer_id = auth.uid())
      or (current_profile_role() = 'purchase_officer' and c.assigned_po_id = auth.uid())
      or manager_branch_access(c.branch_id)
      or (current_profile_role() = 'po_manager' and c.assigned_po_id is not null)
      or (current_profile_role() = 'broker_coordinator' and c.broker_consent is true)
    )
  )
$$;

drop policy cases_select on cases;
create policy cases_select on cases for select to authenticated
  using (
    (current_profile_role() = 'sales_officer' and sales_officer_id = auth.uid())
    or (current_profile_role() = 'purchase_officer' and assigned_po_id = auth.uid())
    or manager_branch_access(branch_id)
    or (current_profile_role() = 'broker_coordinator' and broker_consent is true)
  );

-- Photo review authority moves from "the case's SO" to "an active Broker
-- Coordinator", for every status this was ever callable in -- the Sales
-- Officer never had write access here, full stop.
create or replace function review_broker_photo(p_photo_id uuid, p_visible boolean)
returns void
language plpgsql security definer set search_path = public
as $function$
declare c cases; photo case_photos;
begin
  perform pg_advisory_xact_lock(87210012);
  select * into photo from case_photos where id=p_photo_id;
  select * into c from cases where id=photo.case_id for update;
  if auth.uid() is null or not is_active_broker_coordinator() then raise exception 'Broker coordinator required'; end if;
  if p_visible is null or c.status not in ('pending_customer_decision','listed_for_brokers','broker_offer_selected') then raise exception 'Photo review is unavailable for this case'; end if;
  if p_visible and photo.is_plate_visible then raise exception 'Plate-visible photos cannot be published'; end if;
  update case_photos set broker_visible=p_visible,reviewed_at=clock_timestamp(),reviewed_by=auth.uid() where id=p_photo_id;
  insert into case_events(case_id,event_type,actor_id,actor_role,metadata)
    values(c.id,'broker_photo_reviewed',auth.uid(),'broker_coordinator',jsonb_build_object('photo_id',p_photo_id,'visible',p_visible));
end $function$;

-- Same swap for the staff side of broker_case_action: select, withdraw_consent,
-- and the accept/reject/release/complete branch all move from "case owner
-- (SO)" to "active Broker Coordinator". A broker releasing their own hold is
-- untouched.
create or replace function broker_case_action(p_case_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
  c cases; o broker_offers; r broker_reservations; p profiles;
  is_coordinator boolean; is_broker boolean; reason text; price numeric; current_revision integer; selected_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(87210012);
  select * into c from cases where id = p_case_id for update;
  select * into p from profiles where id = auth.uid() and is_active;
  is_coordinator := coalesce(p.role = 'broker_coordinator', false);
  is_broker := is_approved_broker();
  if c.id is null or not (is_coordinator or is_broker) then raise exception 'Not authorized'; end if;
  perform marketplace_expire_case(c.id);
  select * into c from cases where id = c.id;
  select * into r from broker_reservations where case_id = c.id and status = 'active';
  reason := nullif(trim(p_payload->>'reason'),'');
  if length(reason) > 2000 then return jsonb_build_object('error','Reason is too long'); end if;

  if p_action in ('offer','withdraw_offer') then
    if not is_broker then raise exception 'Approved broker required'; end if;
    if c.status <> 'listed_for_brokers' or c.broker_consent is not true or not exists(select 1 from case_photos where case_id=c.id and broker_visible) then
      return jsonb_build_object('error','Offers are not open. Refresh this vehicle.');
    end if;
    select * into o from broker_offers where case_id=c.id and broker_id=auth.uid();
    current_revision := coalesce(o.revision,0);
    if (p_payload->>'revision')::integer is distinct from current_revision then
      return jsonb_build_object('error','Your offer changed. Refresh before trying again.');
    end if;
    if p_action = 'withdraw_offer' then
      if o.id is null or o.status <> 'current' then return jsonb_build_object('error','No current offer to withdraw'); end if;
      update broker_offers set status='withdrawn',revision=revision+1 where id=o.id returning * into o;
    else
      price := (p_payload->>'amount')::numeric;
      if price is null or price <= 0 or price >= 10000000000 or price <> round(price,2) or length(coalesce(p_payload->>'note','')) > 2000 then
        return jsonb_build_object('error','Enter a valid INR amount and a note under 2000 characters');
      end if;
      insert into broker_offers(case_id,broker_id,amount,note) values(c.id,auth.uid(),price,coalesce(p_payload->>'note',''))
      on conflict(case_id,broker_id) do update set amount=excluded.amount,note=excluded.note,status='current',revision=broker_offers.revision+1,submitted_at=clock_timestamp()
      returning * into o;
    end if;
    insert into case_events(case_id,event_type,actor_id,actor_role,metadata)
      values(c.id,'broker_' || p_action,auth.uid(),'broker',jsonb_build_object('offer_id',o.id,'broker_id',o.broker_id,'amount',o.amount,'revision',o.revision,'note',o.note));
  elsif p_action = 'select' then
    if not is_coordinator then raise exception 'Broker coordinator required'; end if;
    if c.status <> 'listed_for_brokers' or c.broker_consent is not true then return jsonb_build_object('error','Vehicle is no longer open for selection'); end if;
    select * into o from broker_offers where id=(p_payload->>'offer_id')::uuid and case_id=c.id and status='current';
    if o.id is null or o.revision is distinct from (p_payload->>'revision')::integer or not exists(select 1 from brokers where id=o.broker_id and status='approved' and suspended_at is null) then
      return jsonb_build_object('error','Offer changed or broker is unavailable. Refresh before selecting.');
    end if;
    if exists(select 1 from broker_offers b join brokers br on br.id=b.broker_id where b.case_id=c.id and b.status='current' and b.amount>o.amount and br.status='approved' and br.suspended_at is null) and reason is null then
      return jsonb_build_object('error','Give a reason for selecting a lower offer');
    end if;
    selected_at := clock_timestamp();
    insert into broker_reservations(case_id,broker_id,offer_id,amount,selected_by,selection_reason,started_at,expires_at)
      values(c.id,o.broker_id,o.id,o.amount,auth.uid(),reason,selected_at,selected_at + interval '48 hours') returning * into r;
    update broker_offers set status='selected' where id=o.id;
    update cases set status='broker_offer_selected' where id=c.id;
    insert into case_events(case_id,event_type,actor_id,actor_role,metadata,notes)
      values(c.id,'broker_offer_selected',auth.uid(),'broker_coordinator',jsonb_build_object('reservation_id',r.id,'broker_id',r.broker_id,'amount',r.amount,'expires_at',r.expires_at),reason);
  elsif p_action = 'withdraw_consent' then
    if not is_coordinator then raise exception 'Broker coordinator required'; end if;
    if c.status not in ('listed_for_brokers','broker_offer_selected') or reason is null then return jsonb_build_object('error','An open listing and withdrawal reason are required'); end if;
    if r.id is not null then perform marketplace_finish_hold(r.id,'released','Customer withdrew marketplace consent'); end if;
    update cases set broker_consent=false,broker_consent_at=clock_timestamp(),status='withdrawn',withdrawn_at=clock_timestamp(),withdrawn_reason=reason where id=c.id;
    update broker_offers set status='withdrawn' where case_id=c.id;
    insert into case_events(case_id,event_type,actor_id,actor_role,notes) values(c.id,'broker_consent_withdrawn',auth.uid(),'broker_coordinator',reason);
  elsif p_action in ('accept','reject','release','complete') then
    if r.id is null or r.id is distinct from (p_payload->>'reservation_id')::uuid then return jsonb_build_object('error','Reservation ended or changed. Refresh this vehicle.'); end if;
    if not is_coordinator and not (p_action='release' and is_broker and r.broker_id=auth.uid()) then raise exception 'Not authorized'; end if;
    if p_action='accept' then
      if r.customer_decision is not null then return jsonb_build_object('error','Customer decision already recorded'); end if;
      update broker_reservations set customer_decision='accepted',customer_decision_at=clock_timestamp() where id=r.id;
    elsif p_action in ('reject','release') then
      if reason is null then return jsonb_build_object('error','A reason is required'); end if;
      if p_action='reject' then update broker_reservations set customer_decision='rejected',customer_decision_at=clock_timestamp() where id=r.id; end if;
      perform marketplace_finish_hold(r.id,'released',reason);
    else
      if r.customer_decision is distinct from 'accepted' or (p_payload->>'payment_complete')::boolean is distinct from true or (p_payload->>'handover_complete')::boolean is distinct from true then
        return jsonb_build_object('error','Customer acceptance, payment and handover confirmations are required');
      end if;
      if r.expires_at <= clock_timestamp() then
        perform marketplace_expire_case(c.id);
        return jsonb_build_object('error','Reservation expired before completion');
      end if;
      update broker_reservations set status='completed',payment_complete=true,handover_complete=true,ended_at=clock_timestamp(),ended_by=auth.uid() where id=r.id;
      update cases set status='broker_deal_closed',closed_at=clock_timestamp(),closed_by=auth.uid() where id=c.id;
      update broker_offers set status=case when id=r.offer_id then 'closed' else 'withdrawn' end where case_id=c.id;
    end if;
    insert into case_events(case_id,event_type,actor_id,actor_role,metadata,notes)
      values(c.id,'broker_' || p_action,auth.uid(),coalesce(p.role::text,'broker'),jsonb_build_object('reservation_id',r.id,'broker_id',r.broker_id,'amount',r.amount),reason);
  else raise exception 'Unknown action';
  end if;
  return jsonb_build_object('ok',true);
end $function$;
