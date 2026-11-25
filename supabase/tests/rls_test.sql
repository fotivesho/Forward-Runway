-- Row-level security tests. Run by scripts/test-db.sh against a throwaway Postgres
-- with a minimal stand-in for Supabase's auth schema. Any failed assertion aborts.
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'ASSERTION FAILED: %', msg; end if;
  raise notice 'ok: %', msg;
end $$;

-- Two users. Signup trigger creates profile + settings.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test');

select pg_temp.assert((select count(*) = 2 from app.profiles where user_id::text like '1111%' or user_id::text like '2222%'), 'signup creates profiles');
select pg_temp.assert((select count(*) = 2 from app.forecast_settings where user_id::text like '1111%' or user_id::text like '2222%'), 'signup creates settings');
select pg_temp.assert((select count(*) = 1 from app.profiles where user_id = '33333333-3333-3333-3333-333333333333'), 'users who signed up before the install get a profile');
select pg_temp.assert((select note = 'legacy row' from public.recurring_rules limit 1), 'the earlier app''s tables in public are untouched');

-- Alice creates data.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into app.accounts (id, name, kind, balance_cents, balance_as_of, is_spendable)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Alice checking', 'checking', 100000, '2026-01-01', true);
insert into app.accounts (id, name, kind, balance_cents, balance_as_of)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'Alice card', 'credit_card', 5000, '2026-01-01');
insert into app.recurring_rules (name, kind, amount_cents, account_id, frequency, start_date)
values ('Pay', 'income', 200000, 'aaaaaaaa-0000-0000-0000-000000000001', 'biweekly', '2026-01-02');
insert into app.calendar_sources (id, name, ics_url) values ('aaaaaaaa-0000-0000-0000-0000000000c1', 'Home', 'https://example.test/secret.ics');
select pg_temp.assert((select count(*) = 2 from app.accounts), 'alice sees her 2 accounts');
reset role;

-- Bob can't see, change or delete Alice's rows.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.assert((select count(*) = 0 from app.accounts), 'bob sees no accounts');
select pg_temp.assert((select count(*) = 0 from app.recurring_rules), 'bob sees no rules');
select pg_temp.assert((select count(*) = 0 from app.calendar_sources), 'bob cannot read alice''s calendar URL');
select pg_temp.assert((select count(*) = 1 from app.profiles), 'bob sees only his own profile');
update app.accounts set balance_cents = 0 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from app.accounts where id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role;
select pg_temp.assert(
  (select balance_cents = 100000 from app.accounts where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'bob''s update/delete of alice''s account had no effect');

-- Bob can't insert rows owned by Alice.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
do $$ begin
  begin
    insert into app.accounts (user_id, name, kind) values ('11111111-1111-1111-1111-111111111111', 'sneaky', 'checking');
    raise exception 'ASSERTION FAILED: insert as another user succeeded';
  exception when insufficient_privilege then raise notice 'ok: cannot insert rows for another user';
  end;
end $$;

-- Bob can't reference Alice's account from his own rows (composite FK).
insert into app.accounts (id, name, kind, balance_cents, balance_as_of, is_spendable)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'Bob checking', 'checking', 5000, '2026-01-01', true);
do $$ begin
  begin
    insert into app.transfers (from_account_id, to_account_id, date, amount_cents)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-01-05', 100);
    raise exception 'ASSERTION FAILED: cross-user transfer reference succeeded';
  exception when foreign_key_violation then raise notice 'ok: cannot reference another user''s account';
  end;
end $$;

-- Cannot move a row to another user.
do $$ begin
  begin
    update app.accounts set user_id = '11111111-1111-1111-1111-111111111111' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
    raise exception 'ASSERTION FAILED: reassigning ownership succeeded';
  exception when insufficient_privilege then raise notice 'ok: cannot hand a row to another user';
  end;
end $$;

-- Data integrity checks.
do $$ begin
  begin
    insert into app.accounts (name, kind, is_spendable) values ('Spendable card?', 'credit_card', true);
    raise exception 'ASSERTION FAILED: spendable credit card allowed';
  exception when check_violation then raise notice 'ok: credit cards can never be spendable cash';
  end;
  begin
    insert into app.recurring_rules (name, kind, amount_cents, account_id, frequency, start_date)
    values ('Card payment without card', 'card_payment', 100, 'bbbbbbbb-0000-0000-0000-000000000001', 'monthly', '2026-01-01');
    raise exception 'ASSERTION FAILED: card payment without destination allowed';
  exception when check_violation then raise notice 'ok: card payments must name the card';
  end;
  begin
    insert into app.transactions (account_id, date, amount_cents, direction, description)
    values ('bbbbbbbb-0000-0000-0000-000000000001', '2026-01-01', -5, 'out', 'negative');
    raise exception 'ASSERTION FAILED: negative amount allowed';
  exception when check_violation then raise notice 'ok: amounts must be positive cents';
  end;
end $$;

-- delete_my_data only touches the caller's rows.
select app.delete_my_data();
select pg_temp.assert((select count(*) = 0 from app.accounts), 'bob''s data wiped');
reset role;
select pg_temp.assert((select count(*) = 2 from app.accounts where user_id = '11111111-1111-1111-1111-111111111111'),
  'alice''s data untouched by bob''s wipe');

-- Anonymous visitors see nothing.
set role anon;
do $$ begin
  begin
    perform count(*) from app.accounts;
    raise exception 'ASSERTION FAILED: anon could read accounts';
  exception when insufficient_privilege then raise notice 'ok: anonymous visitors cannot read financial data';
  end;
end $$;
reset role;

-- Deleting a user cascades everything.
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select pg_temp.assert((select count(*) = 0 from app.accounts where user_id = '11111111-1111-1111-1111-111111111111'),
  'account deletion removes all data');

\echo 'ALL RLS TESTS PASSED'
