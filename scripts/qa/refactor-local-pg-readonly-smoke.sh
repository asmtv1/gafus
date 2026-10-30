#!/usr/bin/env bash
# Strictly read-only acceptance of the Refactor-owned LOCAL snapshot.
# Never connects to production TCP; never prints PII or credentials.
set -euo pipefail

ROOT="/Users/asmtv1/Desktop/gafus-refactor"
[[ "$PWD" == "$ROOT" ]] || { echo "LOCAL_PG_REFUSE_CWD"; exit 2; }
SOCKET="$ROOT/.local-pg-scratch/production_snapshot_20261024/s"
[[ -S "$SOCKET/.s.PGSQL.55921" ]] || { echo "LOCAL_PG_SOCKET_MISSING"; exit 2; }
[[ ! -L "$SOCKET" && ! -L "$ROOT/.local-pg-scratch" ]] || { echo "LOCAL_PG_SYMLINK_REFUSED"; exit 2; }

expected=$'t|t\nt|t|t|t|t'
# BEGIN READ ONLY and PGOPTIONS are independent defense in depth.
if ! actual=$(PGHOST="$SOCKET" PGPORT=55921 PGUSER=asmtv1   PGDATABASE=gafus_refactor_real_work_20261024   PGCONNECT_TIMEOUT=4   PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=5000'   psql -X -w -q -A -t -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
SELECT
  current_database() = 'gafus_refactor_real_work_20261024',
  current_setting('data_directory') = '/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/production_snapshot_20261024/data';
SET LOCAL ROLE gafus_refactor_local_real;
SELECT
  current_user = 'gafus_refactor_local_real',
  current_setting('default_transaction_read_only') = 'on',
  (SELECT COUNT(*) >= 150 FROM _prisma_migrations),
  (SELECT COUNT(*) = 0 FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL),
  to_regclass('"FeedPost"') IS NOT NULL;
ROLLBACK;
SQL
); then
  echo "LOCAL_PG_READONLY_BLOCKED"
  exit 2
fi
[[ "$actual" == "$expected" ]] || { echo "LOCAL_PG_READONLY_CONTRACT_FAILED"; exit 3; }
echo "LOCAL_PG_READONLY_PASS: exact local socket, role, readonly, directory, migrations, FeedPost schema"
