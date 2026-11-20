#!/bin/bash
# Private disposable localhost PG18. No existing Postgres instance or remote host.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb psql python3; do
  command -v "$bin" >/dev/null || { echo "ACCOUNT_DELETE_QA_BIN_MISSING:$bin"; exit 2; }
done
DIR="$(mktemp -d /tmp/gafus-account-delete-rows-pg.XXXXXX)"
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
cleanup(){
  if [ "$started" = 1 ]; then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true; fi
  if [[ "$DIR" == /tmp/gafus-account-delete-rows-pg.* && ! -L "$DIR" ]]; then rm -rf -- "$DIR"; fi
}
trap cleanup EXIT INT TERM
umask 077
initdb -D "$DIR/pg" -A trust -U accountdeleteqa --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/postgres.log" -o "-h 127.0.0.1 -p $PORT -c timezone=UTC" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U accountdeleteqa gafus_account_delete_qa
export DATABASE_URL="postgresql://accountdeleteqa@127.0.0.1:$PORT/gafus_account_delete_qa?schema=public"
export GAFUS_ACCOUNT_DELETE_REAL_PG=enabled NODE_ENV=test
(cd packages/prisma && pnpm exec prisma db push --skip-generate > "$DIR/schema.log" 2>&1) || { tail -65 "$DIR/schema.log"; exit 1; }
# Prisma db push does not execute SQL triggers: apply the reviewed forward migration
# explicitly to this disposable QA database (NOT the historic migration chain).
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U accountdeleteqa -d gafus_account_delete_qa \
  -f "$ROOT/packages/prisma/migrations/20261119121000_account_deletion_audit_immutable/migration.sql" > "$DIR/audit-guard.log" 2>&1 || { tail -40 "$DIR/audit-guard.log"; exit 1; }
export NODE_OPTIONS="${NODE_OPTIONS:-} --require $ROOT/scripts/qa/block-nonlocal-network.cjs"
# macOS ships Bash 3.2, where expanding an empty array under set -u can abort
# a command substitution yet let a later printf conceal the failed test.
if [[ -n "${GAFUS_TEST_REPORT_PATH:-}" ]]; then
  [[ "$GAFUS_TEST_REPORT_PATH" == /* ]] || { echo 'Report path must be absolute'; exit 2; }
  pnpm --filter @gafus/identity-write-server exec vitest run src/accountDeletionRows.realpg.test.ts --maxWorkers=1 \
    --reporter=json --outputFile="$GAFUS_TEST_REPORT_PATH"
else
  pnpm --filter @gafus/identity-write-server exec vitest run src/accountDeletionRows.realpg.test.ts --maxWorkers=1
fi
printf 'ACCOUNT_DELETE_REAL_PG_PASS: owner challenge, cleanup rollback, durable audit/counter\n'
