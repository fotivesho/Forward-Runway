-- Forward Runway 1.0 schema
-- Every user-owned table:
--   * has user_id defaulting to auth.uid()
--   * has row-level security enabled with policies restricted to user_id = auth.uid()
--   * references other user-owned rows through composite (id, user_id) foreign keys,
--     so a row can never point at another user's account, rule or event.
-- Money is bigint cents. Dates are calendar dates (no time zone).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles and settings
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  timezone text not null default 'America/New_York' check (char_length(timezone) between 1 and 64),
  onboarded_at timestamptz,
  hide_amounts boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.forecast_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  cash_floor_cents bigint not null default 50000 check (cash_floor_cents >= 0),
  default_horizon_days smallint not null default 30 check (default_horizon_days in (30, 60, 90)),
  stale_after_days smallint not null default 3 check (stale_after_days between 1 and 60),
  auto_pay_statements boolean not null default true,
  unseen_plans_buffer_pct smallint not null default 15 check (unseen_plans_buffer_pct between 0 and 50),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Accounts (cash, savings, credit cards, loans)
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('checking', 'savings', 'cash', 'credit_card', 'loan')),
  -- Assets: amount held. Cards/loans: amount owed. Null = not entered yet.
  balance_cents bigint,
  balance_as_of date,
  balance_source text not null default 'manual' check (balance_source in ('manual', 'statement', 'import', 'onboarding')),
  balance_updated_at timestamptz,
  is_spendable boolean not null default false,
  credit_limit_cents bigint check (credit_limit_cents is null or credit_limit_cents >= 0),
  statement_close_day smallint check (statement_close_day is null or statement_close_day = -1 or statement_close_day between 1 and 31),
  payment_due_day smallint check (payment_due_day is null or payment_due_day = -1 or payment_due_day between 1 and 31),
  payment_account_id uuid,
  pay_in_full boolean not null default true,
  apr_bps integer check (apr_bps is null or apr_bps between 0 and 10000),
  minimum_payment_cents bigint check (minimum_payment_cents is null or minimum_payment_cents >= 0),
  archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  -- Credit cards and loans are never spendable cash.
  constraint liabilities_not_spendable check (not (kind in ('credit_card', 'loan') and is_spendable)),
  constraint balance_has_date check (balance_cents is null or balance_as_of is not null)
);
alter table public.accounts
  add constraint accounts_payment_account_fk foreign key (payment_account_id, user_id)
  references public.accounts (id, user_id) on delete set null (payment_account_id);

-- ---------------------------------------------------------------------------
-- Recurring rules and per-occurrence overrides
-- ---------------------------------------------------------------------------
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('income', 'bill', 'subscription', 'loan_payment', 'savings_transfer', 'card_payment', 'transfer', 'expense')),
  amount_cents bigint not null check (amount_cents > 0),
  account_id uuid not null,
  to_account_id uuid,
  category text check (char_length(category) <= 40),
  frequency text not null check (frequency in ('once', 'weekly', 'biweekly', 'monthly', 'semimonthly')),
  start_date date not null,
  end_date date,
  day_of_month smallint check (day_of_month is null or day_of_month = -1 or day_of_month between 1 and 31),
  second_day_of_month smallint check (second_day_of_month is null or second_day_of_month = -1 or second_day_of_month between 1 and 31),
  weekend_adjust text not null default 'none' check (weekend_adjust in ('none', 'before', 'after')),
  is_estimate boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (to_account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  constraint end_after_start check (end_date is null or end_date >= start_date),
  constraint distinct_accounts check (to_account_id is null or to_account_id <> account_id),
  constraint transfer_kinds_need_destination check (
    kind not in ('loan_payment', 'savings_transfer', 'card_payment', 'transfer') or to_account_id is not null
  ),
  constraint income_has_no_destination check (kind <> 'income' or to_account_id is null)
);

create table public.occurrence_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rule_id uuid not null,
  original_date date not null,
  action text not null check (action in ('skip', 'modify', 'posted')),
  new_date date,
  amount_cents bigint check (amount_cents is null or amount_cents > 0),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (rule_id, original_date),
  foreign key (rule_id, user_id) references public.recurring_rules (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Calendars (declared before transactions, which can link to an event)
-- ---------------------------------------------------------------------------
create table public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  -- Secret iCal address. Only ever read server-side; never sent back to the browser in full.
  ics_url text check (ics_url is null or (char_length(ics_url) <= 2000 and ics_url ~* '^(https|webcal)://')),
  kind text not null default 'ics_url' check (kind in ('ics_url', 'ics_upload', 'manual')),
  enabled boolean not null default true,
  last_status text not null default 'never' check (last_status in ('never', 'ok', 'error', 'empty_suspicious')),
  last_synced_at timestamptz,
  last_attempt_at timestamptz,
  last_error text check (char_length(last_error) <= 300),
  event_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id uuid,
  external_uid text check (char_length(external_uid) <= 500),
  date date not null,
  title text not null check (char_length(title) between 1 and 200),
  location text check (char_length(location) <= 200),
  cancelled boolean not null default false,
  estimate_cents bigint check (estimate_cents is null or estimate_cents >= 0),
  estimate_source text check (estimate_source in ('your_correction', 'similar_correction', 'your_history', 'typical', 'not_spending', 'unknown', 'user')),
  estimate_confirmed boolean not null default false,
  category text check (char_length(category) <= 40),
  cap_cents bigint check (cap_cents is null or cap_cents >= 0),
  decision text check (decision in ('proceed', 'cheaper', 'postpone', 'skip')),
  essential boolean not null default false,
  payment_account_id uuid,
  duplicate_of uuid,
  duplicate_confirmed boolean not null default false,
  not_duplicate_of uuid[] not null default '{}',
  missing_from_feed boolean not null default false,
  user_corrected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (source_id, external_uid),
  foreign key (source_id, user_id) references public.calendar_sources (id, user_id) on delete cascade,
  foreign key (payment_account_id, user_id) references public.accounts (id, user_id) on delete set null (payment_account_id),
  foreign key (duplicate_of, user_id) references public.calendar_events (id, user_id) on delete set null (duplicate_of)
);

-- ---------------------------------------------------------------------------
-- One-time transactions, transfers, card statements, goals
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null,
  date date not null,
  amount_cents bigint not null check (amount_cents > 0),
  direction text not null check (direction in ('in', 'out')),
  description text not null check (char_length(description) between 1 and 120),
  category text check (char_length(category) <= 40),
  status text not null default 'planned' check (status in ('planned', 'posted')),
  cleared boolean not null default false,
  is_estimate boolean not null default false,
  flexible boolean not null default true,
  calendar_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (calendar_event_id, user_id) references public.calendar_events (id, user_id) on delete set null (calendar_event_id)
);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_account_id uuid not null,
  to_account_id uuid not null,
  date date not null,
  amount_cents bigint not null check (amount_cents > 0),
  note text check (char_length(note) <= 120),
  status text not null default 'planned' check (status in ('planned', 'posted')),
  cleared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (from_account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (to_account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  constraint transfer_distinct check (from_account_id <> to_account_id)
);

create table public.card_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null,
  closing_date date not null,
  statement_balance_cents bigint not null check (statement_balance_cents >= 0),
  minimum_due_cents bigint check (minimum_due_cents is null or minimum_due_cents >= 0),
  due_date date not null,
  paid_cents bigint not null default 0 check (paid_cents >= 0),
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, closing_date),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  constraint due_after_close check (due_date > closing_date)
);

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'other' check (kind in ('wedding', 'emergency', 'debt', 'other')),
  account_id uuid,
  target_cents bigint not null check (target_cents > 0),
  target_date date,
  monthly_contribution_cents bigint check (monthly_contribution_cents is null or monthly_contribution_cents >= 0),
  protected boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete set null (account_id)
);

-- ---------------------------------------------------------------------------
-- Memory: corrections, decisions, scenarios
-- ---------------------------------------------------------------------------
create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('event_estimate', 'category_rename', 'preference')),
  match_key text not null check (char_length(match_key) between 1 and 200),
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, match_key)
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_type text not null check (subject_type in ('event', 'purchase', 'statement', 'occurrence', 'question', 'scenario')),
  subject_id text check (char_length(subject_id) <= 200),
  decision text not null check (char_length(decision) between 1 and 60),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  adjustments jsonb not null default '[]'::jsonb check (jsonb_typeof(adjustments) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index on public.accounts (user_id);
create index on public.recurring_rules (user_id);
create index on public.occurrence_overrides (user_id);
create index on public.transactions (user_id, date);
create index on public.transfers (user_id, date);
create index on public.card_statements (user_id, account_id);
create index on public.savings_goals (user_id);
create index on public.calendar_sources (user_id);
create index on public.calendar_events (user_id, date);
create index on public.corrections (user_id, kind);
create index on public.decisions (user_id, created_at desc);
create index on public.scenarios (user_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'forecast_settings', 'accounts', 'recurring_rules', 'calendar_events',
                           'transactions', 'transfers', 'card_statements', 'savings_goals', 'corrections', 'scenarios']
  loop
    execute format('create trigger touch_%1$s before update on public.%1$I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row-level security: each user sees and changes only their own rows.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'forecast_settings', 'accounts', 'recurring_rules', 'occurrence_overrides',
                           'calendar_sources', 'calendar_events', 'transactions', 'transfers', 'card_statements',
                           'savings_goals', 'corrections', 'decisions', 'scenarios']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy "own rows: select" on public.%I for select to authenticated using (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "own rows: insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "own rows: update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "own rows: delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- New users get a profile and default settings.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  insert into public.forecast_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Privacy: wipe all of the caller's financial data (keeps the login).
-- SECURITY INVOKER: runs under the caller's RLS, so it can only ever touch their rows.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_data()
returns void language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.decisions where user_id = uid;
  delete from public.corrections where user_id = uid;
  delete from public.scenarios where user_id = uid;
  delete from public.transactions where user_id = uid;
  delete from public.transfers where user_id = uid;
  delete from public.card_statements where user_id = uid;
  delete from public.occurrence_overrides where user_id = uid;
  delete from public.recurring_rules where user_id = uid;
  delete from public.savings_goals where user_id = uid;
  delete from public.calendar_events where user_id = uid;
  delete from public.calendar_sources where user_id = uid;
  delete from public.accounts where user_id = uid;
  update public.profiles set onboarded_at = null, display_name = null where user_id = uid;
  update public.forecast_settings
     set cash_floor_cents = 50000, default_horizon_days = 30, stale_after_days = 3,
         auto_pay_statements = true, unseen_plans_buffer_pct = 15
   where user_id = uid;
end $$;

revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
