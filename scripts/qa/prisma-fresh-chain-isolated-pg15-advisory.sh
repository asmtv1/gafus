#!/usr/bin/env bash
# Replays the officially reviewed fresh-only Prisma baseline on a disposable PostgreSQL 15 using a QA-only narrow version-guard adapter.
# DOES NOT alter any historical migration or touch existing databases.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
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
COPY=""
cleanup(){
  if [[ "$STARTED" == 1 ]]; then pg_ctl -D "$TMP/pg" -m immediate -w stop >/dev/null 2>&1 || true; fi
  if [[ -n "$COPY" && "$COPY" == "$ROOT"/ci-cd/bootstrap/prisma-fresh/.apply-new-empty-db.pg15qa-*.mjs && -f "$COPY" && ! -L "$COPY" ]]; then rm -f -- "$COPY"; fi
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
echo "FRESH_CHAIN_DISPOSABLE_READY db=$DB host=127.0.0.1 postgres=15_qa_guard"
# The authoritative application guard remains 16-18; prove compatibility on
# an owned throwaway database using the identical reviewed source except for
# exactly one version assertion. NEVER substitute this for a release approval.
COPY="$ROOT/ci-cd/bootstrap/prisma-fresh/.apply-new-empty-db.pg15qa-$TOKEN.mjs"
node - "$ROOT/ci-cd/bootstrap/prisma-fresh/apply-new-empty-db.mjs" "$COPY" <<'NODE'
const fs=require('node:fs');
const [src,dst]=process.argv.slice(2);
const original=fs.readFileSync(src,'utf8');
const from="assert(Number(version) >= 160000 && Number(version) < 190000,";
const to="assert(Number(version) >= 150000 && Number(version) < 190000,";
if(original.split(from).length!==2) throw Error('PG15_QA_SOURCE_GUARD_DRIFT');
if(!dst.includes('/.apply-new-empty-db.pg15qa-') || !dst.endsWith('.mjs')) throw Error('PG15_QA_PATH_INVALID');
fs.writeFileSync(dst,original.replace(from,to),{flag:'wx',mode:0o600});
NODE
node "$COPY" --check
node "$COPY" --apply
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U "$USER" -d "$DB" -Atc "SELECT 'FRESH_CHAIN_LEDGER_OK:'||count(*)||':'||count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL) FROM \"_prisma_migrations\""
