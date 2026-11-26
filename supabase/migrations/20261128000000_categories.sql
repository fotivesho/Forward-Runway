-- Your categories: which group each belongs to (needs / wants / savings) and an optional monthly
-- budget you set yourself. Categories without a row use sensible defaults and a smart budget.
create table app.category_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  grp text not null default 'wants' check (grp in ('needs', 'wants', 'savings')),
  monthly_budget_cents bigint check (monthly_budget_cents is null or monthly_budget_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index on app.category_settings (user_id);
create trigger touch_category_settings before update on app.category_settings for each row execute function app.touch_updated_at();

alter table app.category_settings enable row level security;
alter table app.category_settings force row level security;
revoke all on app.category_settings from anon;
grant select, insert, update, delete on app.category_settings to authenticated;
grant all on app.category_settings to service_role;
create policy "own rows: select" on app.category_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows: insert" on app.category_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows: update" on app.category_settings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows: delete" on app.category_settings for delete to authenticated using (user_id = (select auth.uid()));

-- "Delete my data" forgets these too.
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
  delete from app.bank_connections where user_id = uid;
  delete from app.category_settings where user_id = uid;
  update app.profiles set onboarded_at = null, display_name = null where user_id = uid;
  update app.forecast_settings
     set cash_floor_cents = 50000, default_horizon_days = 30, stale_after_days = 3,
         auto_pay_statements = true, unseen_plans_buffer_pct = 15
   where user_id = uid;
end $$;

revoke all on function app.delete_my_data() from public, anon;
grant execute on function app.delete_my_data() to authenticated;
