-- Emails from the landing page: "send me a note when new features land". Written only by the
-- server (service role); nobody can read or write it through the public API.
create table app.updates_list (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 5 and 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  created_at timestamptz not null default now()
);
create unique index updates_list_email on app.updates_list (lower(email));

alter table app.updates_list enable row level security;
alter table app.updates_list force row level security;
revoke all on app.updates_list from anon, authenticated;
grant all on app.updates_list to service_role;
