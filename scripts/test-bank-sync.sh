#!/usr/bin/env bash
# End-to-end bank sync test: real migrations on a throwaway Postgres, PostgREST in Docker in front
# of it (the same API Supabase uses), and the app's fake bank (PLAID_ENV=mock).
# Requires Postgres 15+ binaries and a running Docker daemon.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | sort -V | tail -1)")"
DATA="$(mktemp -d)"
PORT="${PGPORT_BANK:-54330}"
REST_PORT="${REST_PORT_BANK:-54331}"
SECRET="local-test-secret-not-for-production-use-0123456789"
NAME="runway-bank-test-$$"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then chown -R postgres "$DATA" 2>/dev/null || true; RUN_AS=(runuser -u postgres --); fi
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA/db" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$DATA"
}
trap cleanup EXIT

"${RUN_AS[@]}" "$PGBIN/initdb" -D "$DATA/db" -A trust -U postgres >/dev/null
"${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA/db" -o "-p $PORT -c listen_addresses=127.0.0.1 -k $DATA" -w start >/dev/null
PSQL=("${RUN_AS[@]}" "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/supabase/tests/auth_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -c "create role authenticator login noinherit; grant anon, authenticated, service_role to authenticator;
  insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'bank-test@example.test');"

docker run -d --name "$NAME" --network host \
  -e PGRST_DB_URI="postgres://authenticator@127.0.0.1:$PORT/postgres" \
  -e PGRST_DB_SCHEMAS=app -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$SECRET" \
  -e PGRST_SERVER_PORT="$REST_PORT" postgrest/postgrest:v12.2.3 >/dev/null
for _ in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:$REST_PORT/" && break; sleep 0.5; done

cd "$ROOT"
BANK_IT_REST="http://127.0.0.1:$REST_PORT" BANK_IT_JWT_SECRET="$SECRET" npx vitest run src/lib/plaid/sync.integration.test.ts
