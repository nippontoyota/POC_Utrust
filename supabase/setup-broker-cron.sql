-- Run as the database owner after enabling Supabase Cron (pg_cron).
-- Re-running replaces the existing schedule rather than creating duplicates.
do $$
begin
  if exists(select 1 from cron.job where jobname='expire-broker-reservations') then
    perform cron.unschedule('expire-broker-reservations');
  end if;
  perform cron.schedule('expire-broker-reservations','* * * * *','select public.expire_broker_reservations()');
end $$;
