#!/usr/bin/env bash
#
# Prove the row level security policies do what the comments claim.
#
# Runs every migration against a throwaway PostgreSQL 16 database, then asks
# the questions that matter as each role: can a stranger read the inventory,
# can a customer read our cost prices, and can the admin area write at all.
#
# The last of those is not hypothetical. The admin signs in with a shared
# password rather than through Supabase Auth, so its requests carry no
# auth.uid() and is_admin() is false - which is why every admin write was
# refused until they were moved to the service-role client. Test 02 pins that
# behaviour so the reason is visible rather than folklore.
#
# Needs a local postgres. Nothing here touches the real project.
#
#   ./scripts/verify-rls.sh [port]
#
set -uo pipefail

PORT="${1:-5433}"
PSQL="psql -h /tmp -p $PORT -U postgres"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! $PSQL -tAc 'select 1' >/dev/null 2>&1; then
  echo "No PostgreSQL on port $PORT. Start one, e.g.:"
  echo "  initdb -D /var/tmp/pgverify -U postgres --auth=trust"
  echo "  pg_ctl -D /var/tmp/pgverify -o '-k /tmp -p $PORT' start"
  exit 1
fi

$PSQL -tAc 'drop database if exists pp_rls_test' >/dev/null
$PSQL -tAc 'create database pp_rls_test' >/dev/null

run() { $PSQL -d pp_rls_test -q "$@"; }

run -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/00_supabase_shim.sql" || exit 1

# Each migration is applied, then applied again straight away.
#
# The second run is the real scenario: these are pasted into the Supabase SQL
# editor by hand, and one that half applies has to be safe to retry. It is
# checked here rather than at the end because a migration that renames a
# column cannot be replayed once a later one has renamed it again - and
# nobody does that anyway. Migrations run in order, once.
#
# From 0017 only: everything before it predates the check and has long since
# been applied to the live database, so it will never run again.
RERUN_FROM="0017"
rerun_failures=0

for migration in "$ROOT"/supabase/migrations/*.sql; do
  # The .paste.sql copies are the same statements, flattened for the SQL
  # editor. Applying them here would run every migration twice.
  case "$migration" in *.paste.sql) continue;; esac

  if ! run -v ON_ERROR_STOP=1 -f "$migration" >/dev/null 2>&1; then
    echo "MIGRATION FAILED: $(basename "$migration")"
    run -v ON_ERROR_STOP=1 -f "$migration" 2>&1 | grep ERROR | head -3
    exit 1
  fi

  if [[ ! "$(basename "$migration")" < "$RERUN_FROM" ]]; then
    if ! run -v ON_ERROR_STOP=1 -f "$migration" >/dev/null 2>&1; then
      echo "NOT RE-RUNNABLE: $(basename "$migration")"
      run -v ON_ERROR_STOP=1 -f "$migration" 2>&1 | grep ERROR | head -2
      rerun_failures=$((rerun_failures + 1))
    fi
  fi
done
echo "all migrations applied"
if [ "$rerun_failures" -eq 0 ]; then
  echo "and every migration from $RERUN_FROM survives being run twice"
fi

# The flattened copies are generated. If one has drifted from its migration,
# the stale copy is the one somebody pastes into the SQL editor.
drift=0
for paste in "$ROOT"/supabase/migrations/*.paste.sql; do
  [ -e "$paste" ] || continue
  source_file="${paste%.paste.sql}.sql"
  node "$ROOT/scripts/flatten-migration.mjs" "$source_file" >/dev/null
  if ! git -C "$ROOT" diff --quiet -- "$paste" 2>/dev/null; then
    echo "STALE PASTE COPY: $(basename "$paste") - regenerate it"
    drift=$((drift + 1))
  fi
done
if [ "$drift" -eq 0 ]; then
  echo "the flattened copies match their migrations"
fi
echo

echo "--- reads by role ---"
run -f "$ROOT/supabase/tests/01_reads.sql" 2>&1 | grep -v '^$'
echo
echo "--- a write with no Supabase identity (must be refused) ---"
run -f "$ROOT/supabase/tests/02_write_without_identity.sql" 2>&1 | grep -v '^$'
echo
echo "--- the same write as the service role (must succeed) ---"
run -f "$ROOT/supabase/tests/03_write_as_service_role.sql" 2>&1 | grep -v '^$'
echo
echo "--- delivering a placement and disputing it ---"
run -f "$ROOT/supabase/tests/11_delivery_review.sql" 2>&1 | grep -v '^$'
echo
echo "--- auth rate limiting ---"
run -f "$ROOT/supabase/tests/04_rate_limits.sql" 2>&1 | grep -v '^$'
echo
echo "--- admin accounts (grant, revoke, and who may do either) ---"
run -f "$ROOT/supabase/tests/05_admin_accounts.sql" 2>&1 | grep -v '^$'
echo
echo "--- payments, status history and webhook replay ---"
run -f "$ROOT/supabase/tests/06_payments.sql" 2>&1 | grep -v '^$'
echo
echo "--- ahrefs refresh: tiering, overdue, budget and run locking ---"
run -f "$ROOT/supabase/tests/07_ahrefs_refresh.sql" 2>&1 | grep -v '^$'
echo
echo "--- prices by niche ---"
run -f "$ROOT/supabase/tests/08_niche_prices.sql" 2>&1 | grep -v '^$'
echo
echo "--- publisher contacts ---"
run -f "$ROOT/supabase/tests/09_publisher_contacts.sql" 2>&1 | grep -v '^$'
echo
echo "--- order items follow their order ---"
run -f "$ROOT/supabase/tests/10_order_item_status.sql" 2>&1 | grep -v '^$'
