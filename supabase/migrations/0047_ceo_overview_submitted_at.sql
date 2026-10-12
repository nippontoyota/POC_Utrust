-- Additive only: the dashboard itself is now always all-time/all-branch (the
-- top filter bar was removed), but "Export report" opens a small dialog to
-- pick a date range + branch and filters client-side before downloading --
-- it needs submitted_at on each case to do that without a second RPC call.
create or replace function ceo_overview(p_from date default null, p_to date default null, p_branch uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'ceo' and is_active) then
    raise exception 'Active CEO required';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'Start date must precede end date';
  end if;

  with cohort as (
    select c.*, b.name branch_name
    from cases c
    join branches b on b.id = c.branch_id
    where c.submitted_at is not null
      and (p_branch is null or c.branch_id = p_branch)
      and (p_from is null or (c.submitted_at at time zone 'Asia/Kolkata')::date >= p_from)
      and (p_to is null or (c.submitted_at at time zone 'Asia/Kolkata')::date <= p_to)
  ),
  cohort_detail as (
    select
      co.id, co.case_ref, co.status, co.branch_name, co.submitted_at,
      co.make, co.model, co.variant, co.vehicle_reg_number,
      coalesce(co.final_price, o.offer_price) nippon_amount,
      br.amount broker_amount
    from cohort co
    left join case_offers o on o.case_id = co.id
    left join lateral (
      select amount from broker_reservations r where r.case_id = co.id order by r.started_at desc limit 1
    ) br on true
  ),
  pipeline as (
    select
      count(*) filter (where status = 'pending_evaluation') pending_evaluation,
      count(*) filter (where status = 'pending_customer_decision') awaiting_customer_decision,
      count(*) filter (where status = 'purchase_completion_pending') nippon_purchase_pending,
      count(*) filter (where status = 'listed_for_brokers') broker_listing_live,
      count(*) filter (where status = 'broker_offer_selected') broker_completion_pending,
      count(*) filter (where status = 'closed') nippon_purchases_closed,
      count(*) filter (where status = 'broker_deal_closed') broker_deals_closed,
      count(*) filter (where status in ('cancelled', 'withdrawn', 'rejected_not_listed', 'no_broker_interest', 'no_customer_decision')) cancelled_no_consent_expired,
      count(*) total
    from cohort
  ),
  nippon_closed_amt as (
    select coalesce(sum(nippon_amount), 0) v, count(*) n from cohort_detail where status = 'closed'
  ),
  broker_closed_amt as (
    select coalesce(sum(broker_amount), 0) v, count(*) n from cohort_detail where status = 'broker_deal_closed'
  ),
  branch_perf as (
    select branch_name,
      count(*) cases,
      count(*) filter (where status = 'closed') nippon_closed,
      count(*) filter (where status = 'broker_deal_closed') broker_closed,
      count(*) filter (where status not in ('closed', 'cancelled', 'withdrawn', 'rejected_not_listed', 'no_broker_interest', 'broker_deal_closed', 'no_customer_decision')) open_cases
    from cohort
    group by branch_name
  ),
  -- Live scope: current state, branch-filtered only, no date-range filter.
  live_scope as (
    select c.* from cases c where (p_branch is null or c.branch_id = p_branch)
  ),
  due_soon as (
    select l.*, b.name branch_name, po.full_name po_name
    from live_scope l
    join branches b on b.id = l.branch_id
    left join profiles po on po.id = l.assigned_po_id
    where l.status = 'pending_customer_decision'
      and l.offer_deadline_at is not null
      and l.offer_deadline_at between now() and now() + interval '12 hours'
  ),
  expired as (
    select l.*, b.name branch_name, po.full_name po_name
    from live_scope l
    join branches b on b.id = l.branch_id
    left join profiles po on po.id = l.assigned_po_id
    where l.status = 'pending_customer_decision'
      and l.offer_deadline_at is not null
      and l.offer_deadline_at < now()
  ),
  accepted_pending as (
    select l.*, b.name branch_name, so.full_name so_name
    from live_scope l
    join branches b on b.id = l.branch_id
    left join profiles so on so.id = l.sales_officer_id
    where l.status = 'purchase_completion_pending'
  ),
  broker_live as (
    select
      count(*) filter (where status = 'listed_for_brokers') live_listings,
      count(*) filter (where status = 'broker_offer_selected') awaiting_completion,
      count(*) filter (where status = 'listed_for_brokers'
        and not exists(select 1 from broker_offers o where o.case_id = live_scope.id and o.status = 'current')) without_bids,
      count(*) filter (where status = 'broker_deal_closed') closed_deals
    from live_scope
  ),
  broker_deal_value as (
    select coalesce(sum(r.amount), 0) v
    from live_scope l
    join broker_reservations r on r.case_id = l.id and r.status = 'completed'
    where l.status = 'broker_deal_closed'
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'completed_deals', (select nippon_purchases_closed + broker_deals_closed from pipeline),
      'completed_nippon', (select nippon_purchases_closed from pipeline),
      'completed_broker', (select broker_deals_closed from pipeline),
      'nippon_purchase_value', (select v from nippon_closed_amt),
      'nippon_purchase_count', (select n from nippon_closed_amt),
      'broker_deal_value', (select v from broker_closed_amt),
      'broker_deal_count', (select n from broker_closed_amt),
      'open_cases', (select pending_evaluation + awaiting_customer_decision + nippon_purchase_pending + broker_listing_live + broker_completion_pending from pipeline),
      'due_soon_count', (select count(*) from due_soon),
      'expired_count', (select count(*) from expired)
    ),
    'pipeline', (select to_jsonb(pipeline) from pipeline),
    'branch_performance', (select coalesce(jsonb_agg(to_jsonb(branch_perf) order by branch_perf.branch_name), '[]') from branch_perf),
    'attention', jsonb_build_object(
      'due_soon', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'case_ref', case_ref, 'make', make, 'model', model, 'vehicle_reg_number', vehicle_reg_number,
        'branch_name', branch_name, 'po_name', po_name, 'offer_deadline_at', offer_deadline_at
      ) order by offer_deadline_at), '[]') from due_soon),
      'expired', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'case_ref', case_ref, 'make', make, 'model', model, 'vehicle_reg_number', vehicle_reg_number,
        'branch_name', branch_name, 'po_name', po_name, 'offer_deadline_at', offer_deadline_at
      ) order by offer_deadline_at), '[]') from expired),
      'accepted_pending', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'case_ref', case_ref, 'make', make, 'model', model, 'vehicle_reg_number', vehicle_reg_number,
        'branch_name', branch_name, 'so_name', so_name, 'customer_decision_at', customer_decision_at
      ) order by customer_decision_at), '[]') from accepted_pending)
    ),
    'broker_marketplace', (select to_jsonb(broker_live) || jsonb_build_object('deal_value', (select v from broker_deal_value)) from broker_live),
    'cases', (select coalesce(jsonb_agg(to_jsonb(cohort_detail) order by cohort_detail.case_ref), '[]') from cohort_detail)
  ) into result;

  return result;
end;
$$;
