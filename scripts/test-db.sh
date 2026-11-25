#!/usr/bin/env bash
# Apply the migrations to a throwaway local Postgres and run the RLS test suite.
# Requires Postgres 15+ binaries (initdb, pg_ctl, psql) on PATH or in /usr/lib/postgresql/*/bin.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | sort -V | tail -1)")"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
SOCK="$DATA/sock"
mkdir -p "$SOCK"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$DATA" 2>/dev/null || true
  RUN_AS=(runuser -u postgres --)
fi
cleanup() { "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

"${RUN_AS[@]}" "$PGBIN/initdb" -D "$DATA/db" -A trust -U postgres >/dev/null
"${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA/db" -o "-p $PORT -k $SOCK -c listen_addresses=''" -w start >/dev/null
PSQL=("${RUN_AS[@]}" "$PGBIN/psql" -h "$SOCK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f "$ROOT/supabase/tests/auth_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "Applying $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -t -A -f "$ROOT/supabase/tests/rls_test.sql" 2>&1 | sed "s/^psql:[^:]*:[0-9]*: NOTICE:  /  /" | grep -v "^$"
