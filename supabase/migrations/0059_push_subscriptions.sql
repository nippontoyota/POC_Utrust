-- Web Push subscriptions, one row per browser/device a user has enabled
-- notifications on. Delivery itself (via the `web-push` npm package + VAPID
-- keys) happens server-side in Next.js API routes using the service-role
-- client -- this table only needs self-access RLS since a user manages their
-- own subscription(s), never anyone else's.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (profile_id, endpoint)
);

alter table push_subscriptions enable row level security;

create policy push_subscriptions_select_own on push_subscriptions for select to authenticated
  using (profile_id = auth.uid());

create policy push_subscriptions_insert_own on push_subscriptions for insert to authenticated
  with check (profile_id = auth.uid());

create policy push_subscriptions_delete_own on push_subscriptions for delete to authenticated
  using (profile_id = auth.uid());
