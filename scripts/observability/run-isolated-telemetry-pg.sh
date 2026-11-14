#!/usr/bin/env bash
# Ephemeral isolated REAL PostgreSQL QA. Never reuse the host's 5432/55673 DB.
set -euo pipefail
cd "$(dirname "$0")/../.."
port=65493
db=gafus_refactor_telemetry_sdk57_qa
if pg_isready -h 127.0.0.1 -p "$port" >/dev/null 2>&1; then
  echo "ISOLATED_PG_PORT_ALREADY_IN_USE"; exit 4
fi
tmp=$(mktemp -d /tmp/gafus-uptrace-pg.XXXXXXXX)
if [[ "$tmp" != /tmp/gafus-uptrace-pg.* || ! -d "$tmp" ]]; then
  echo "TEMP_SCOPE_UNSAFE"; exit 4
fi
started=false
cleanup() {
  if [[ "$started" = true ]]; then
    pg_ctl -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true
  fi
  # Only the mktemp-created private scratch directory is ever removed.
  if [[ "$tmp" == /tmp/gafus-uptrace-pg.* && -d "$tmp/data" ]]; then
    rm -rf -- "$tmp"
  fi
}
trap cleanup EXIT INT TERM
chmod 700 "$tmp"
initdb -D "$tmp/data" -U "$(id -un)" --auth=trust --no-instructions > "$tmp/init.log" 2>&1
pg_ctl -D "$tmp/data" -l "$tmp/postgres.log" -o "-h 127.0.0.1 -p $port -k $tmp -c shared_buffers=64MB -c max_connections=40" start >/dev/null
started=true
createdb -h 127.0.0.1 -p "$port" -U "$(id -un)" "$db"
export DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$port/$db?schema=public"
export GAFUS_TELEMETRY_TEST_ISOLATED=true
export GAFUS_API_REALPG_ISOLATED=1
echo "ISOLATED_POSTGRES_STARTED"
pnpm --filter @gafus/prisma exec prisma db push --schema schema.prisma --skip-generate
echo "ISOLATED_SCHEMA_READY"
pnpm --filter @gafus/mobile-ota-server exec vitest run --config vitest.telemetry.realpg.config.ts
echo "ISOLATED_REALPG_TESTS_PASS"
if [[ "${GAFUS_NONPROD_E2E_ENABLED:-false}" = "true" ]]; then
  pnpm --filter @gafus/api exec tsx ../../scripts/observability/gafus-nonprod-hono-e2e.mts
  echo "ISOLATED_HONO_CLOUD_E2E_PASS"
fi

if [[ "${GAFUS_NONPROD_OBSERVE_METRICS_E2E_ENABLED:-false}" = "true" ]]; then
  pnpm --filter @gafus/api exec tsx ../../scripts/observability/gafus-nonprod-observe-hono-e2e.mts
  echo "ISOLATED_OBSERVE_METRICS_CLOUD_E2E_PASS"
fi
