-- Morning notification: each device that turned it on, and the last day it was sent.
create table if not exists app.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  last_sent_on date,
  created_at timestamptz not null default now(),
  unique (endpoint)
);
create index if not exists push_subscriptions_user on app.push_subscriptions (user_id);
alter table app.push_subscriptions enable row level security;
alter table app.push_subscriptions force row level security;
revoke all on app.push_subscriptions from anon;
grant select, insert, update, delete on app.push_subscriptions to authenticated;
grant all on app.push_subscriptions to service_role;
create policy "own rows: select" on app.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows: insert" on app.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows: update" on app.push_subscriptions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows: delete" on app.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
