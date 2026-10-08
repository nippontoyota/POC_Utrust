-- Replacement for so_broker_summary (dropped in the PO revamp): same shape,
-- scoped to the PO's own cases via po_id instead of sales_officer_id.
create function po_broker_summary() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from profiles where id=auth.uid() and role='purchase_officer' and is_active) then raise exception 'Active PO required'; end if;
  return (with owned as (
    select c.id, exists(select 1 from broker_reservations r where r.case_id=c.id and r.status='active' and r.expires_at>now()) reserved,
      exists(select 1 from broker_reservations r where r.case_id=c.id and r.status='active' and r.expires_at>now() and r.expires_at<=now()+interval '2 hours') expiring,
      not exists(select 1 from broker_reservations r where r.case_id=c.id and r.status='active' and r.expires_at<=now())
        and exists(select 1 from broker_offers o join brokers b on b.id=o.broker_id where o.case_id=c.id and o.status='current' and b.status='approved' and b.suspended_at is null) has_offers
    from cases c where c.po_id=auth.uid() and c.status in ('listed_for_brokers','broker_offer_selected') and c.broker_consent
  ) select jsonb_build_object('listed',count(*) filter(where not reserved),'reserved',count(*) filter(where reserved),
      'awaiting_selection',count(*) filter(where not reserved and has_offers),'expiring',count(*) filter(where expiring)) from owned);
end $$;
revoke all on function po_broker_summary() from public,anon;
grant execute on function po_broker_summary() to authenticated;
