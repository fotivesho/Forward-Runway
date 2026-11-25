-- Simulates an existing project: an earlier app's tables in `public` (same names as ours)
-- and a user who signed up before this schema was installed.
create table public.recurring_rules (id serial primary key, note text);
create table public.transfers (id serial primary key, note text);
create table public.occurrence_overrides (id serial primary key, note text);
create table public.forecast_settings (id serial primary key, note text);
insert into public.recurring_rules (note) values ('legacy row');
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'existing@example.test');
