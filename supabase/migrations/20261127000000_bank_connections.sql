-- Bank connections (Plaid).
--
-- Two tables, split on purpose:
--   app.bank_connections  what the user may see: institution name, status, last sync. RLS: own rows only.
--   app.bank_secrets      the bank access token (encrypted by the app as well) and the sync cursor.
--                         No grants to anon or authenticated at all: only the server, using the
--                         service role, can read it. It never reaches a browser.
-- Accounts and transactions that came from a bank carry the bank's id (external_id), so a
-- re-sync updates them instead of adding duplicates.

-- A balance can now come from the bank.
alter table app.accounts drop constraint if exists accounts_balance_source_check;
alter table app.accounts
  add constraint accounts_balance_source_check check (balance_source in ('manual', 'statement', 'import', 'onboarding', 'bank'));

create table app.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null default 'plaid' check (provider in ('plaid')),
  institution_name text check (char_length(institution_name) <= 100),
  status text not null default 'ok' check (status in ('ok', 'needs_reauth', 'error')),
  last_synced_at timestamptz,
  last_error text check (char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table app.bank_secrets (
  connection_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null unique check (char_length(item_id) <= 200),
  access_token_enc text not null check (char_length(access_token_enc) <= 2000),
  sync_cursor text check (char_length(sync_cursor) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (connection_id, user_id) references app.bank_connections (id, user_id) on delete cascade
);

alter table app.accounts
  add column bank_connection_id uuid,
  add column external_id text check (char_length(external_id) <= 200),
  add constraint accounts_bank_connection_fk foreign key (bank_connection_id, user_id)
    references app.bank_connections (id, user_id) on delete set null (bank_connection_id),
  add constraint accounts_external_unique unique (user_id, external_id);

alter table app.transactions
  add column external_id text check (char_length(external_id) <= 200),
  add column pending boolean not null default false,
  add constraint transactions_external_unique unique (user_id, external_id);

create index on app.bank_connections (user_id);
create index on app.bank_secrets (user_id);

create trigger touch_bank_connections before update on app.bank_connections for each row execute function app.touch_updated_at();
create trigger touch_bank_secrets before update on app.bank_secrets for each row execute function app.touch_updated_at();

-- What the user can see: their own connections. Disconnecting goes through the server (which
-- also removes the connection at Plaid), so users may read and delete, nothing else.
alter table app.bank_connections enable row level security;
alter table app.bank_connections force row level security;
revoke all on app.bank_connections from anon, authenticated;
grant select, delete on app.bank_connections to authenticated;
create policy "own rows: select" on app.bank_connections for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows: delete" on app.bank_connections for delete to authenticated using (user_id = (select auth.uid()));

-- Secrets: server only.
alter table app.bank_secrets enable row level security;
alter table app.bank_secrets force row level security;
revoke all on app.bank_secrets from anon, authenticated;

grant all on app.bank_connections, app.bank_secrets to service_role;

-- "Delete my data" also forgets bank connections (the server removes them at Plaid first).
create or replace function app.delete_my_data()
returns void language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from app.decisions where user_id = uid;
  delete from app.corrections where user_id = uid;
  delete from app.scenarios where user_id = uid;
  delete from app.transactions where user_id = uid;
  delete from app.transfers where user_id = uid;
  delete from app.card_statements where user_id = uid;
  delete from app.occurrence_overrides where user_id = uid;
  delete from app.recurring_rules where user_id = uid;
  delete from app.savings_goals where user_id = uid;
  delete from app.calendar_events where user_id = uid;
  delete from app.calendar_sources where user_id = uid;
  delete from app.accounts where user_id = uid;
  -- Cascades to app.bank_secrets through the foreign key.
  delete from app.bank_connections where user_id = uid;
  update app.profiles set onboarded_at = null, display_name = null where user_id = uid;
  update app.forecast_settings
     set cash_floor_cents = 50000, default_horizon_days = 30, stale_after_days = 3,
         auto_pay_statements = true, unseen_plans_buffer_pct = 15
   where user_id = uid;
end $$;

revoke all on function app.delete_my_data() from public, anon;
grant execute on function app.delete_my_data() to authenticated;
