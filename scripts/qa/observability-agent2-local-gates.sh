#!/usr/bin/env bash
# Isolated Agent2 gate set. No remote endpoints, no production mutations.
# Run grouped gates after a batch of changes; full regression is a separate gate.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
umask 077
mkdir -p artifacts
report="artifacts/a2-obs-local-gates.tsv"
printf 'gate\tstatus\n' > "$report"
gate() {
  name="$1"; shift
  echo "A2 gate start: $name"
  if "$@"; then
    printf '%s\tPASS\n' "$name" >> "$report"
  else
    rc="$?"
    printf '%s\tFAIL_%s\n' "$name" "$rc" >> "$report"
    echo "A2 gate failed: $name (exit $rc)"
    exit "$rc"
  fi
}
gate logger_build pnpm --filter @gafus/logger build
gate prisma_generate pnpm --filter @gafus/prisma exec prisma generate
gate prisma_typecheck pnpm --filter @gafus/prisma typecheck
gate opentelemetry node --test scripts/qa/otel-local-collector.test.mjs
gate local_multi_instance node --test scripts/qa/observability-multi-instance.test.mjs
gate multi_window_comparator node --test scripts/qa/observability-load-median.test.mjs
gate monitoring_contract node --test ci-cd/docker/prometheus/health-monitoring.contract.test.mjs
gate bounded_logging_overlay node --test ci-cd/docker/observability-log-rotation.contract.test.mjs
gate staging_release_preflight_contract node --test scripts/qa/observability-staging-preflight.test.mjs
gate api_operation_contract pnpm --filter @gafus/api exec vitest run --config vitest.config.ts src/lib/operation-observability.test.ts
if [ "$(printenv A2_OBS_WITH_REAL_MULTI || true)" = "1" ]; then
  gate real_two_api_two_worker_pg_redis_restore bash scripts/qa/observability-real-multi-instance-isolated.sh
fi
if [ "$(printenv A2_OBS_WITH_OTEL_BENCH || true)" = "1" ]; then
  gate otel_micro_overhead node scripts/qa/observability-otel-overhead.mjs
fi
if [ "$(printenv A2_OBS_WITH_DB_RESTORE || true)" = "1" ]; then
  gate isolated_database_restore bash scripts/qa/observability-restore-rpo-rto.sh
fi
if [ "$(printenv A2_OBS_WITH_ALERT_DELIVERY || true)" = "1" ]; then
  gate isolated_prometheus_alertmanager bash scripts/qa/prometheus-alertmanager-isolated.sh
fi
if [ "$(printenv A2_OBS_WITH_PROMTOOL || true)" = "1" ]; then
  gate prometheus_rule_fixtures bash scripts/qa/observability-promtool-rules.sh
fi
printf 'A2_OBS_LOCAL_GATE_SUMMARY=%s\n' "$report"
cat "$report"
