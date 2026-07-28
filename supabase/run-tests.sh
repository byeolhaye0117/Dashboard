#!/usr/bin/env bash
#
# 로컬 PostgreSQL에 스키마를 올리고 테스트를 전부 돌린다.
#
#   ./supabase/run-tests.sh
#
# Supabase 계정 없이도 스키마와 계산 로직을 검증할 수 있다.
# PostgreSQL 14 이상이 필요하다.
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PGPORT:-55433}"
DATA_DIR="${PGDATA_DIR:-/tmp/gym-test-pg}"
DB=gym_test

command -v initdb >/dev/null || export PATH="/usr/lib/postgresql/16/bin:$PATH"
command -v initdb >/dev/null || { echo "PostgreSQL이 설치되어 있지 않습니다"; exit 1; }

# PostgreSQL 서버는 root로 실행할 수 없다. root라면 postgres 사용자로 돌린다.
if [ "$(id -u)" = "0" ]; then
  id -u postgres >/dev/null 2>&1 || { echo "root로 실행 중인데 postgres 사용자가 없습니다"; exit 1; }
  DATA_DIR="${PGDATA_DIR:-/var/lib/postgresql/gym-test-pg}"
  run_pg() { su postgres -c "PATH='$PATH' $*"; }
else
  run_pg() { eval "$@"; }
fi

cleanup() { run_pg "pg_ctl -D '$DATA_DIR' stop -s" >/dev/null 2>&1 || true; }
trap cleanup EXIT

rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"
[ "$(id -u)" = "0" ] && chown -R postgres "$DATA_DIR"
run_pg "initdb -D '$DATA_DIR' -A trust -U postgres" >/dev/null
run_pg "pg_ctl -D '$DATA_DIR' -o '-k /tmp -p $PORT -c listen_addresses=' -l /tmp/gym-test-pg.log start -s" >/dev/null
sleep 1

psql -h /tmp -p "$PORT" -U postgres -q -c "create database $DB;"

# Supabase가 기본 제공하는 것들의 최소 스텁 (로컬 검증 전용)
psql -h /tmp -p "$PORT" -U postgres -d "$DB" -q <<'SQL'
create schema if not exists auth;
create table auth.users (id uuid primary key);
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
SQL

echo "── 마이그레이션 ──"
for f in supabase/migrations/*.sql; do
  printf "  %-34s" "$(basename "$f")"
  psql -h /tmp -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
  echo "OK"
done

printf "  %-34s" "seed.sql (중복 실행 검사)"
psql -h /tmp -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f supabase/seed.sql >/dev/null
psql -h /tmp -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f supabase/seed.sql >/dev/null
echo "OK"

echo ""
echo "── 테스트 ──"
fail=0
for t in supabase/tests/*.sql; do
  out=$(psql -h /tmp -p "$PORT" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -f "$t" 2>&1 || true)
  pass=$(grep -c '\[통과\]' <<<"$out" || true)
  err=$(grep -c 'ERROR' <<<"$out" || true)
  if [ "$err" -gt 0 ]; then
    fail=1
    echo "  ✗ $(basename "$t") — 오류 ${err}건"
    grep 'ERROR' <<<"$out" | head -5 | sed 's/^/      /'
  else
    echo "  ✓ $(basename "$t") — ${pass}건 통과"
  fi
done

echo ""
[ "$fail" -eq 0 ] && echo "전체 통과" || { echo "실패한 테스트가 있습니다"; exit 1; }
