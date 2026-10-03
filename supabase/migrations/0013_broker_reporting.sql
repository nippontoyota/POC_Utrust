create function broker_report(p_from date default null, p_to date default null, p_branch uuid default null, p_broker uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not exists(select 1 from profiles where id=auth.uid() and role='manager' and is_active) then raise exception 'Active manager required'; end if;
  if p_from is not null and p_to is not null and p_from>p_to then raise exception 'Start date must precede end date'; end if;
  with scoped as (
    select c.*,b.name branch_name from cases c join branches b on b.id=c.branch_id
    join profiles p on p.id=auth.uid()
    where (p.is_group_manager or p.branch_id=c.branch_id) and (p_branch is null or c.branch_id=p_branch)
      and c.listed_at is not null
      and (p_broker is null or exists(select 1 from broker_offers o where o.case_id=c.id and o.broker_id=p_broker))
  ), reservations as (
    select r.*,b.company_name broker_name from broker_reservations r join scoped c on c.id=r.case_id join brokers b on b.id=r.broker_id
    where p_broker is null or r.broker_id=p_broker
  ), attempts as (
    select * from reservations where (p_from is null or (started_at at time zone 'Asia/Kolkata')::date>=p_from)
      and (p_to is null or (started_at at time zone 'Asia/Kolkata')::date<=p_to)
  ), completed as (
    select * from reservations where status='completed'
      and (p_from is null or (ended_at at time zone 'Asia/Kolkata')::date>=p_from)
      and (p_to is null or (ended_at at time zone 'Asia/Kolkata')::date<=p_to)
  ), cohort as (
    select * from scoped where (p_from is null or (listed_at at time zone 'Asia/Kolkata')::date>=p_from)
      and (p_to is null or (listed_at at time zone 'Asia/Kolkata')::date<=p_to)
  ), performance as (
    select broker_id id,broker_name name,count(*) attempts,
      count(*) filter(where status='completed') completed,
      count(*) filter(where status='expired' or (status='active' and expires_at<=now())) expired,
      count(*) filter(where status='released') released,
      coalesce(sum(amount) filter(where status='completed'),0) value
    from attempts group by broker_id,broker_name
  ), reasons as (
    select case when status='active' and expires_at<=now() then '48-hour deadline elapsed' else coalesce(end_reason,status) end reason,count(*) count
    from attempts where status in ('released','expired') or (status='active' and expires_at<=now()) group by 1
  ), case_rows as (
    select c.id,c.case_ref,c.branch_name,r.broker_name,
      case when c.status='broker_offer_selected' and not exists(select 1 from reservations h where h.case_id=c.id and h.status='active' and h.expires_at>now()) then 'listed_for_brokers' else c.status::text end status,
      case when r.status='active' and r.expires_at>now() then r.expires_at end expires_at
    from cohort c left join lateral (select * from reservations h where h.case_id=c.id order by h.started_at desc limit 1) r on true
    order by c.listed_at desc limit 100
  ) select jsonb_build_object(
    'listed',(select count(*) from scoped c where c.status in ('listed_for_brokers','broker_offer_selected') and c.broker_consent and exists(select 1 from case_photos ph where ph.case_id=c.id and ph.broker_visible)),
    'without_offers',(select count(*) from scoped c where c.status in ('listed_for_brokers','broker_offer_selected') and c.broker_consent
      and exists(select 1 from case_photos ph where ph.case_id=c.id and ph.broker_visible)
      and not exists(select 1 from reservations r where r.case_id=c.id and r.status='active' and r.expires_at>now())
      and (exists(select 1 from reservations r where r.case_id=c.id and r.status='active' and r.expires_at<=now())
        or not exists(select 1 from broker_offers o join brokers b on b.id=o.broker_id where o.case_id=c.id and o.status='current' and b.status='approved' and b.suspended_at is null))),
    'active',(select count(*) from reservations where status='active' and expires_at>now()),
    'expiring',(select count(*) from reservations where status='active' and expires_at>now() and expires_at<=now()+interval '2 hours'),
    'completed',(select count(*) from completed),'deal_value',(select coalesce(sum(amount),0) from completed),
    'cohort_listed',(select count(*) from cohort),
    'cohort_completed',(select count(*) from cohort c where exists(select 1 from reservations r where r.case_id=c.id and r.status='completed')),
    'brokers',(select coalesce(jsonb_agg(to_jsonb(p) order by p.completed desc,p.name),'[]') from performance p),
    'outcomes',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from reasons r),
    'cases',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from case_rows c)
  ) into result;
  return result;
end $$;
revoke all on function broker_report(date,date,uuid,uuid) from public,anon;
grant execute on function broker_report(date,date,uuid,uuid) to authenticated;

create function so_broker_summary() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from profiles where id=auth.uid() and role='sales_officer' and is_active) then raise exception 'Active SO required'; end if;
  return (with owned as (
    select c.id, exists(select 1 from broker_reservations r where r.case_id=c.id and r.status='active' and r.expires_at>now()) reserved,
      exists(select 1 from broker_reservations r where r.case_id=c.id and r.status='active' and r.expires_at>now() and r.expires_at<=now()+interval '2 hours') expiring,
      not exists(select 1 from broker_reservations r where r.case_id=c.id and r.status='active' and r.expires_at<=now())
        and exists(select 1 from broker_offers o join brokers b on b.id=o.broker_id where o.case_id=c.id and o.status='current' and b.status='approved' and b.suspended_at is null) has_offers
    from cases c where c.sales_officer_id=auth.uid() and c.status in ('listed_for_brokers','broker_offer_selected') and c.broker_consent
  ) select jsonb_build_object('listed',count(*) filter(where not reserved),'reserved',count(*) filter(where reserved),
      'awaiting_selection',count(*) filter(where not reserved and has_offers),'expiring',count(*) filter(where expiring)) from owned);
end $$;
revoke all on function so_broker_summary() from public,anon;
grant execute on function so_broker_summary() to authenticated;
