-- Marketplace writes are serialized for this POC, including suspension and expiry.
-- This avoids cross-case lock-order races; use ordered per-broker/per-case locks
-- if marketplace write throughput outgrows the single transaction lock.
alter table brokers
  add column broker_ref text unique not null default ('BR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  add column suspended_at timestamptz,
  add column status_reason text,
  add column status_changed_at timestamptz,
  add column status_changed_by uuid references profiles(id);
alter table cases add column evaluation_started_at timestamptz;
alter table case_photos
  add column broker_visible boolean not null default false,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references profiles(id),
  add constraint broker_photo_no_plate check (not broker_visible or not is_plate_visible);

create table broker_offers (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  broker_id uuid not null references brokers(id),
  amount numeric(12,2) not null check (amount > 0 and amount < 10000000000),
  note text not null default '' check (length(note) <= 2000),
  status text not null default 'current' check (status in ('current','withdrawn','reconfirm','selected','closed')),
  revision integer not null default 1,
  submitted_at timestamptz not null default now(),
  unique(case_id, broker_id)
);
create table broker_reservations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  broker_id uuid not null references brokers(id),
  offer_id uuid not null references broker_offers(id),
  amount numeric(12,2) not null check (amount > 0),
  selected_by uuid not null references profiles(id),
  selection_reason text,
  started_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '48 hours'),
  status text not null default 'active' check (status in ('active','expired','released','completed')),
  customer_decision text check (customer_decision in ('accepted','rejected')),
  customer_decision_at timestamptz,
  ended_at timestamptz,
  ended_by uuid,
  end_reason text,
  payment_complete boolean not null default false,
  handover_complete boolean not null default false,
  check (expires_at > started_at)
);
create unique index one_active_broker_reservation on broker_reservations(case_id) where status = 'active';
create index broker_reservations_broker on broker_reservations(broker_id);
create index broker_reservations_expiry on broker_reservations(expires_at) where status = 'active';
create index broker_offers_broker on broker_offers(broker_id);
create table broker_admin_events (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references brokers(id),
  actor_id uuid not null references profiles(id),
  action text not null,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table broker_offers enable row level security;
alter table broker_reservations enable row level security;
alter table broker_admin_events enable row level security;

create or replace function is_approved_broker() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from brokers where id = auth.uid() and status = 'approved' and suspended_at is null)
    and not exists(select 1 from profiles where id = auth.uid())
$$;
create function marketplace_group_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'manager' and is_group_manager and is_active)
$$;
create function marketplace_staff_access(p_case_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from cases c join profiles p on p.id = auth.uid()
    where c.id = p_case_id and p.is_active and (
      (p.role = 'sales_officer' and c.sales_officer_id = p.id) or
      (p.role = 'purchase_officer' and c.assigned_po_id = p.id) or
      (p.role = 'manager' and (p.is_group_manager or p.branch_id = c.branch_id))))
$$;
create policy broker_offers_staff_read on broker_offers for select to authenticated using (marketplace_staff_access(case_id));
create policy broker_reservations_staff_read on broker_reservations for select to authenticated using (marketplace_staff_access(case_id));
create policy broker_admin_read on broker_admin_events for select to authenticated using (marketplace_group_manager());
create policy brokers_manager_read on brokers for select to authenticated using (marketplace_group_manager());

-- Clients may not insert privileged metadata through the existing signup/draft policies.
revoke insert on brokers from authenticated;
grant insert(id,company_name,contact_name,phone,email,status) on brokers to authenticated;
revoke insert, update on case_photos from authenticated;
grant insert(case_id,category,file_size_bytes,id,is_plate_visible,mime_type,storage_path,uploaded_by) on case_photos to authenticated;
revoke insert, update on cases from authenticated;
grant insert(branch_id,sales_officer_id,status) on cases to authenticated;
grant update(customer_name,customer_mobile,vehicle_reg_number,make,model,variant,registration_year,fuel_type,transmission,odometer_km,ownership_count,has_loan,lender_note,customer_expected_price) on cases to authenticated;
drop policy profiles_insert_self_staff on profiles;
create policy profiles_insert_self_staff on profiles for insert to authenticated with check (
  id = (select auth.uid()) and role in ('sales_officer','purchase_officer') and not is_group_manager
);

create function marketplace_finish_hold(p_id uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r broker_reservations;
begin
  update broker_reservations set status = p_status, ended_at = clock_timestamp(),
    ended_by = auth.uid(), end_reason = p_reason where id = p_id and status = 'active' returning * into r;
  if r.id is null then return; end if;
  update broker_offers set status = 'reconfirm' where case_id = r.case_id and status in ('current','selected');
  update cases set status = 'listed_for_brokers' where id = r.case_id and status = 'broker_offer_selected';
  insert into case_events(case_id,event_type,actor_id,actor_role,metadata,notes)
    values(r.case_id,'broker_reservation_' || p_status,auth.uid(),coalesce(current_profile_role()::text,'broker'),
      jsonb_build_object('reservation_id',r.id,'broker_id',r.broker_id,'amount',r.amount),p_reason);
end $$;
create function marketplace_expire_case(p_case_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from broker_reservations where case_id = p_case_id and status = 'active' and expires_at <= clock_timestamp()
  loop perform marketplace_finish_hold(r.id,'expired','48-hour deadline elapsed'); end loop;
end $$;
create function expire_broker_reservations() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform pg_advisory_xact_lock(87210012);
  for r in select c.id from cases c where exists(select 1 from broker_reservations b where b.case_id=c.id and b.status='active' and b.expires_at <= clock_timestamp()) order by c.id for update
  loop perform marketplace_expire_case(r.id); end loop;
end $$;

create function broker_case_action(p_case_id uuid, p_action text, p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c cases; o broker_offers; r broker_reservations; p profiles;
  is_owner boolean; is_broker boolean; reason text; price numeric; current_revision integer; selected_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(87210012);
  select * into c from cases where id = p_case_id for update;
  select * into p from profiles where id = auth.uid() and is_active;
  is_owner := coalesce(p.role = 'sales_officer' and c.sales_officer_id = auth.uid(), false);
  is_broker := is_approved_broker();
  if c.id is null or not (is_owner or is_broker) then raise exception 'Not authorized'; end if;
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
    if not is_owner then raise exception 'Case owner required'; end if;
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
      values(c.id,'broker_offer_selected',auth.uid(),'sales_officer',jsonb_build_object('reservation_id',r.id,'broker_id',r.broker_id,'amount',r.amount,'expires_at',r.expires_at),reason);
  elsif p_action = 'withdraw_consent' then
    if not is_owner then raise exception 'Case owner required'; end if;
    if c.status not in ('listed_for_brokers','broker_offer_selected') or reason is null then return jsonb_build_object('error','An open listing and withdrawal reason are required'); end if;
    if r.id is not null then perform marketplace_finish_hold(r.id,'released','Customer withdrew marketplace consent'); end if;
    update cases set broker_consent=false,broker_consent_at=clock_timestamp(),status='withdrawn',withdrawn_at=clock_timestamp(),withdrawn_reason=reason where id=c.id;
    update broker_offers set status='withdrawn' where case_id=c.id;
    insert into case_events(case_id,event_type,actor_id,actor_role,notes) values(c.id,'broker_consent_withdrawn',auth.uid(),'sales_officer',reason);
  elsif p_action in ('accept','reject','release','complete') then
    if r.id is null or r.id is distinct from (p_payload->>'reservation_id')::uuid then return jsonb_build_object('error','Reservation ended or changed. Refresh this vehicle.'); end if;
    if not is_owner and not (p_action='release' and is_broker and r.broker_id=auth.uid()) then raise exception 'Not authorized'; end if;
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
end $$;

create function review_broker_photo(p_photo_id uuid, p_visible boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c cases; photo case_photos;
begin
  perform pg_advisory_xact_lock(87210012);
  select * into photo from case_photos where id=p_photo_id;
  select * into c from cases where id=photo.case_id for update;
  if auth.uid() is null or c.sales_officer_id is distinct from auth.uid() or not exists(select 1 from profiles where id=auth.uid() and role='sales_officer' and is_active) then raise exception 'Case owner required'; end if;
  if p_visible is null or c.status not in ('pending_customer_decision','listed_for_brokers','broker_offer_selected') then raise exception 'Photo review is unavailable for this case'; end if;
  if p_visible and photo.is_plate_visible then raise exception 'Plate-visible photos cannot be published'; end if;
  update case_photos set broker_visible=p_visible,reviewed_at=clock_timestamp(),reviewed_by=auth.uid() where id=p_photo_id;
  insert into case_events(case_id,event_type,actor_id,actor_role,metadata)
    values(c.id,'broker_photo_reviewed',auth.uid(),'sales_officer',jsonb_build_object('photo_id',p_photo_id,'visible',p_visible));
end $$;

create function manage_broker(p_broker_id uuid, p_action text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare b brokers; r record;
begin
  if not marketplace_group_manager() then raise exception 'Active group manager required'; end if;
  if p_reason is null or trim(p_reason)='' or length(p_reason)>2000 then raise exception 'A reason is required (maximum 2000 characters)'; end if;
  perform pg_advisory_xact_lock(87210012);
  select * into b from brokers where id=p_broker_id for update;
  if b.id is null or exists(select 1 from profiles where id=b.id) then raise exception 'Broker not found or identity conflicts with a staff account'; end if;
  if p_action='approve' and b.status in ('pending','rejected') then
    update brokers set status='approved',approved_at=clock_timestamp(),approved_by=auth.uid()::text,suspended_at=null where id=b.id;
  elsif p_action='reject' and b.status='pending' then
    update brokers set status='rejected' where id=b.id;
  elsif p_action='suspend' and b.status='approved' and b.suspended_at is null then
    update brokers set suspended_at=clock_timestamp() where id=b.id;
    for r in select c.id from cases c where exists(select 1 from broker_reservations br where br.case_id=c.id and br.broker_id=b.id and br.status='active') order by c.id for update
    loop
      perform marketplace_expire_case(r.id);
      perform marketplace_finish_hold(br.id,'released','Broker suspended') from broker_reservations br where br.case_id=r.id and br.status='active' and br.broker_id=b.id;
    end loop;
    update broker_offers set status='withdrawn' where broker_id=b.id and status<>'closed';
  elsif p_action='reactivate' and b.status='approved' and b.suspended_at is not null then
    update brokers set suspended_at=null where id=b.id;
  else raise exception 'Broker status changed or action is invalid'; end if;
  update brokers set status_reason=trim(p_reason),status_changed_at=clock_timestamp(),status_changed_by=auth.uid() where id=b.id;
  insert into broker_admin_events(broker_id,actor_id,action,reason) values(b.id,auth.uid(),p_action,trim(p_reason));
end $$;

create function start_po_evaluation(p_case_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c cases;
begin
  select * into c from cases where id=p_case_id for update;
  if auth.uid() is null or c.assigned_po_id is distinct from auth.uid() or not exists(select 1 from profiles where id=auth.uid() and role='purchase_officer' and is_active) then raise exception 'Assigned PO required'; end if;
  if c.status<>'pending_evaluation' then raise exception 'Case is not awaiting evaluation'; end if;
  if c.evaluation_started_at is not null then return; end if;
  update cases set evaluation_started_at=clock_timestamp() where id=c.id;
  insert into case_events(case_id,event_type,actor_id,actor_role) values(c.id,'evaluation_started',auth.uid(),'purchase_officer');
end $$;
create function require_evaluation_started() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from cases c join profiles p on p.id=auth.uid() where c.id=new.case_id and c.evaluation_started_at is not null and p.is_active and p.role='purchase_officer' and c.assigned_po_id=p.id) then
    raise exception 'Start the evaluation before submitting an offer';
  end if;
  return new;
end $$;
create trigger evaluation_must_be_started before insert on case_offers for each row execute function require_evaluation_started();

-- A narrowly projected read interface; brokers never gain SELECT on raw cases.
create function broker_marketplace(p_search text default '', p_branch uuid default null, p_view text default 'marketplace', p_page integer default 0, p_sort text default 'newest', p_case_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not is_approved_broker() then raise exception 'Approved broker required'; end if;
  with visible as (
    select c.*, b.name branch_name, o.id own_offer_id,o.amount own_amount,o.status own_status,o.revision own_revision,o.note own_note,o.submitted_at own_submitted_at,
      r.id hold_id,r.broker_id hold_broker,r.expires_at hold_deadline,
      exists(select 1 from broker_reservations h where h.case_id=c.id and h.broker_id=auth.uid()) has_history,
      exists(select 1 from case_photos ph where ph.case_id=c.id and ph.broker_visible and not ph.is_plate_visible) has_photos
    from cases c join branches b on b.id=c.branch_id
    left join broker_offers o on o.case_id=c.id and o.broker_id=auth.uid()
    left join broker_reservations r on r.case_id=c.id and r.status='active'
    where (p_case_id is null or c.id=p_case_id) and (p_branch is null or c.branch_id=p_branch)
      and concat_ws(' ',c.case_ref,c.make,c.model,c.variant) ilike '%' || left(coalesce(p_search,''),100) || '%'
  ), filtered as (
    select *, (status in ('listed_for_brokers','broker_offer_selected') and broker_consent and has_photos) is_listed,
      (hold_id is not null and hold_deadline>now()) reserved
    from visible
  ), eligible as (
    select * from filtered where
      (p_view='marketplace' and is_listed) or
      (p_view='offers' and own_offer_id is not null) or
      (p_view='reservations' and hold_broker=auth.uid() and reserved) or
      (p_view='history' and has_history)
  ), paged as (
    select * from eligible order by
      case when p_sort='year' then registration_year end desc nulls last,
      case when p_sort='mileage' then odometer_km end asc nulls last,
      listed_at desc nulls last,id limit 12 offset greatest(0,least(coalesce(p_page,0),10000))*12
  ) select jsonb_build_object('total',(select count(*) from eligible),'server_now',now(),'items',coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'case_ref',e.case_ref,'branch_name',e.branch_name,'make',e.make,'model',e.model,'variant',e.variant,
    'registration_year',e.registration_year,'odometer_km',e.odometer_km,'fuel_type',e.fuel_type,'transmission',e.transmission,
    'availability',case when not e.is_listed then 'unavailable' when e.reserved then 'reserved' else 'open' end,
    'expires_at',case when e.reserved then e.hold_deadline end,
    'own_offer',case when e.own_offer_id is not null then jsonb_build_object('id',e.own_offer_id,'amount',e.own_amount,'status',case when e.hold_id is not null and not e.reserved and e.own_status in ('current','selected') then 'reconfirm' else e.own_status end,'revision',e.own_revision,'note',e.own_note,'submitted_at',e.own_submitted_at) end,
    'photos',case when e.is_listed then (select coalesce(jsonb_agg(jsonb_build_object('id',ph.id,'category',ph.category,'file_size_bytes',ph.file_size_bytes)),'[]') from case_photos ph where ph.case_id=e.id and ph.broker_visible and not ph.is_plate_visible) else '[]'::jsonb end,
    'reservations',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'amount',h.amount,'status',case when h.status='active' and h.expires_at<=now() then 'expired' else h.status end,'started_at',h.started_at,'expires_at',h.expires_at,'customer_decision',h.customer_decision,'ended_at',h.ended_at) order by h.started_at desc),'[]') from broker_reservations h where h.case_id=e.id and h.broker_id=auth.uid()),
    'history',(select coalesce(jsonb_agg(jsonb_build_object('id',ev.id,'event_type',ev.event_type,'created_at',ev.created_at,'amount',ev.metadata->'amount') order by ev.created_at desc),'[]') from case_events ev where ev.case_id=e.id and ev.metadata->>'broker_id'=auth.uid()::text)
  )),'[]')) into result from paged e;
  return result;
end $$;

create function staff_broker_case(p_case_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not marketplace_staff_access(p_case_id) then raise exception 'Not authorized'; end if;
  return jsonb_build_object('server_now',now(),
    'offers',(select coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object('broker_name',b.company_name,'broker_ref',b.broker_ref,'broker_contact',b.contact_name,'broker_phone',b.phone,'broker_email',b.email,'approved',b.status='approved' and b.suspended_at is null) order by o.amount desc),'[]') from broker_offers o join brokers b on b.id=o.broker_id where o.case_id=p_case_id),
    'reservations',(select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('broker_name',b.company_name) order by r.started_at desc),'[]') from broker_reservations r join brokers b on b.id=r.broker_id where r.case_id=p_case_id),
    'photos',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category,'file_size_bytes',file_size_bytes,'broker_visible',broker_visible,'is_plate_visible',is_plate_visible)),'[]') from case_photos where case_id=p_case_id),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by created_at desc),'[]') from case_events e where case_id=p_case_id and event_type like 'broker_%'));
end $$;

revoke all on function marketplace_finish_hold(uuid,text,text), marketplace_expire_case(uuid), expire_broker_reservations(), require_evaluation_started() from public,anon,authenticated;
grant execute on function expire_broker_reservations() to service_role;
revoke all on function broker_case_action(uuid,text,jsonb), review_broker_photo(uuid,boolean), manage_broker(uuid,text,text), start_po_evaluation(uuid), broker_marketplace(text,uuid,text,integer,text,uuid), staff_broker_case(uuid), marketplace_group_manager(), marketplace_staff_access(uuid) from public,anon;
grant execute on function broker_case_action(uuid,text,jsonb), review_broker_photo(uuid,boolean), manage_broker(uuid,text,text), start_po_evaluation(uuid), broker_marketplace(text,uuid,text,integer,text,uuid), staff_broker_case(uuid), marketplace_group_manager(), marketplace_staff_access(uuid) to authenticated;
