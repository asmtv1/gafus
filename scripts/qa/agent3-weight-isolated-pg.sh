#!/bin/zsh
# Run from the GAFUS Refactor Mac only. No production/database service is reused.
# Own cluster, schema, synthetic fixture SQL and ephemeral JWT exist for this run
# only; startup and cleanup enforce the AG3_OWNED marker in .local-pg-scratch.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
PG_BIN=/opt/homebrew/opt/postgresql@14/bin
cd "$ROOT"
[ -x "$PG_BIN/initdb" ] && [ -x "$PG_BIN/pg_ctl" ] || { echo 'BLOCKER: PG14_BIN_MISSING'; exit 11; }
[ -d "$ROOT/.local-pg-scratch" ] || { echo 'BLOCKER: ISOLATED_SCRATCH_MISSING'; exit 12; }
# The complete Prisma schema can exceed a nearly-full APFS volume. Preflight
# before initdb: do not leave a partial cluster if the volume is saturated.
FREE_KIB=$(df -Pk "$ROOT" | awk 'END {print $4}')
if [[ ! "$FREE_KIB" =~ '^[0-9]+$' ]] || (( FREE_KIB < 1048576 )); then
  echo "BLOCKER: INSUFFICIENT_DISK_FOR_EPHEMERAL_PG (available_KiB=$FREE_KIB; required_KiB=1048576)"
  exit 21
fi
OWN_DIR=$(mktemp -d "$ROOT/.local-pg-scratch/agent3-weight-accept-XXXXXXXX")
printf 'agent3-weight-disposable-only\n' > "$OWN_DIR/AG3_OWNED"
chmod 700 "$OWN_DIR"
PORT=$(python3 - <<'PY'
import socket
for p in range(57190,57990):
 with socket.socket() as s:
  try: s.bind(('127.0.0.1',p))
  except OSError: continue
  print(p)
  break
else: raise SystemExit('NO_FREE_LOOPBACK_PG_PORT')
PY
)
STARTED=0
cleanup() {
  result=$?
  trap - EXIT
  if [[ "$STARTED" == 1 ]]; then
    "$PG_BIN/pg_ctl" -D "$OWN_DIR/pg" -m immediate -w stop >/dev/null 2>&1 || { echo 'BLOCKER: ISOLATED_PG_STOP_FAILED'; result=19; }
  fi
  if [[ "$OWN_DIR" == "$ROOT"/.local-pg-scratch/agent3-weight-accept-* && -f "$OWN_DIR/AG3_OWNED" && "$(cat "$OWN_DIR/AG3_OWNED")" == 'agent3-weight-disposable-only' ]]; then
    rm -rf -- "$OWN_DIR"
    echo 'ISOLATED_CLUSTER_CLEANED=YES'
  else
    echo 'BLOCKER: ISOLATED_CLUSTER_CLEANUP_GUARD_FAILED'
  fi
  exit "$result"
}
trap cleanup EXIT
"$PG_BIN/initdb" -D "$OWN_DIR/pg" -U ag3_local --auth-local=trust --auth-host=trust --no-instructions > "$OWN_DIR/initdb.log" 2>&1 || { echo 'BLOCKER: INITDB_FAILED'; tail -16 "$OWN_DIR/initdb.log"; exit 13; }
"$PG_BIN/pg_ctl" -D "$OWN_DIR/pg" -o "-c listen_addresses=127.0.0.1 -c port=$PORT -c unix_socket_directories=$OWN_DIR" -l "$OWN_DIR/postmaster.log" -w start > "$OWN_DIR/start.log" 2>&1 || { echo 'BLOCKER: PG14_START_FAILED'; tail -18 "$OWN_DIR/start.log"; exit 14; }
STARTED=1
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U ag3_local agent3_weight_accept || { echo 'BLOCKER: ISOLATED_CREATEDB_FAILED'; exit 15; }
export DATABASE_URL="postgresql://ag3_local@127.0.0.1:$PORT/agent3_weight_accept?schema=public"
export AG3_WEIGHT_REAL_PG=1
export AG3_WEIGHT_OWNED_DIR="$OWN_DIR"
export JWT_SECRET="$(openssl rand -hex 40)"
export JWT_REFRESH_SECRET="$(openssl rand -hex 40)"
export NODE_ENV=test
export PGHOST=127.0.0.1
export PGPORT="$PORT"
export PGUSER=ag3_local
export PGDATABASE=agent3_weight_accept
identity=$("$PG_BIN/psql" -tAX -c "select current_database()||'/'||current_user||'/'||host(inet_server_addr())||'/'||inet_server_port()")
[[ "$identity" == "agent3_weight_accept/ag3_local/127.0.0.1/$PORT" ]] || { echo 'BLOCKER: NON_ISOLATED_PG_IDENTITY'; printf 'identity_proof=%s expected_port=%s\n' "$identity" "$PORT"; exit 16; }
echo "EPHEMERAL_PG_IDENTITY_VALIDATED=YES; port=$PORT; disposable=YES"
pnpm --filter @gafus/prisma exec prisma db push --schema schema.prisma --skip-generate > /tmp/gafus-agent3-weight-pg-schema-20261030.log 2>&1 || { echo 'BLOCKER: PRISMA_ISOLATED_SCHEMA_PUSH_FAILED'; tail -38 /tmp/gafus-agent3-weight-pg-schema-20261030.log; exit 17; }
echo 'ISOLATED_PG_SCHEMA=READY'
pnpm --filter @gafus/api exec vitest run src/routes/v1/agent3-pet-weight-pg-acceptance.test.ts --maxWorkers=1 > /tmp/gafus-agent3-weight-realpg-vitest-20261030.log 2>&1 || { echo 'BLOCKER: REAL_PG_ACCEPTANCE_FAILED'; tail -70 /tmp/gafus-agent3-weight-realpg-vitest-20261030.log; exit 18; }
echo 'REAL_PG_ACCEPTANCE_PASS=YES'
tail -18 /tmp/gafus-agent3-weight-realpg-vitest-20261030.log
