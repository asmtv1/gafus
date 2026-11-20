#!/usr/bin/env bash
# Replays the officially reviewed fresh-only Prisma baseline on a disposable PostgreSQL 18.
# DOES NOT alter any historical migration or touch existing databases.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for cmd in initdb pg_ctl createdb psql node python3; do command -v "$cmd" >/dev/null || { echo "FRESH_CHAIN_TOOL_MISSING:$cmd" >&2; exit 2; }; done
umask 077
TMP="$(mktemp -d /tmp/gafus-fresh-chain-qa.XXXXXXXX)"
case "$TMP" in /tmp/gafus-fresh-chain-qa.*) ;; *) echo INVALID_TEMP; exit 2;; esac
PORT="$(python3 - <<'PY'
import socket
with socket.socket() as s:
 s.bind(('127.0.0.1',0));print(s.getsockname()[1])
PY
)"
TOKEN="$(basename "$TMP" | tr -cd 'a-z0-9' | tail -c 9)"
DB="gafus_fresh_qa_${TOKEN}"
USER="gafusfreshqa"
STARTED=0
cleanup(){
  if [[ "$STARTED" == 1 ]]; then pg_ctl -D "$TMP/pg" -m immediate -w stop >/dev/null 2>&1 || true; fi
  if [[ -d "$TMP" && ! -L "$TMP" && "$TMP" == /tmp/gafus-fresh-chain-qa.* ]]; then rm -rf -- "$TMP"; fi
}
trap cleanup EXIT INT TERM
initdb -D "$TMP/pg" -A trust -U "$USER" --no-instructions >"$TMP/init.log" 2>&1
pg_ctl -D "$TMP/pg" -l "$TMP/server.log" -o "-h 127.0.0.1 -p $PORT -c timezone=UTC" -w start >/dev/null
STARTED=1
createdb -h 127.0.0.1 -p "$PORT" -U "$USER" "$DB"
# Reset inherited connection variables: only the generated DB may be written.
unset DIRECT_URL SHADOW_DATABASE_URL REDIS_URL
export DATABASE_URL="postgresql://$USER@127.0.0.1:$PORT/$DB?schema=public"
export GAFUS_FRESH_BOOTSTRAP_CONFIRM="$DB"
echo "FRESH_CHAIN_DISPOSABLE_READY db=$DB host=127.0.0.1 postgres=18"
node ci-cd/bootstrap/prisma-fresh/apply-new-empty-db.mjs --check
bash packages/prisma/scripts/bootstrap-fresh-postgres.sh
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U "$USER" -d "$DB" -Atc "SELECT 'FRESH_CHAIN_LEDGER_OK:'||count(*)||':'||count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL) FROM \"_prisma_migrations\""
