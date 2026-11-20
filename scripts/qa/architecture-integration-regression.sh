#!/usr/bin/env bash
# FUTURE ONLY: local QA of a separately authorized, frozen integration worktree.
# Does not switch branches, add/commit/merge/cherry-pick/push/reset/stash or deploy.
set -Eeuo pipefail
RUN_ID="${1:?Pass unique run id, e.g. int-20261112-r1}"
[[ "$RUN_ID" =~ ^[a-z][a-z0-9-]{0,32}$ ]] || { echo 'INVALID_RUN_ID'; exit 2; }
[[ "${GAFUS_INTEGRATION_TESTS_APPROVED:-}" == 1 ]] || {
  echo 'NOT_APPROVED: must explicitly approve frozen integration candidate tests'; exit 2;
}
ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
for active in /Users/asmtv1/Desktop/gafus-refactor /Users/asmtv1/Desktop/gafus-agent2-observability /Users/asmtv1/Desktop/gafus-agent3-worker; do
  [[ "$ROOT" != "$active" ]] || { echo 'REFUSE_ACTIVE_AGENT_WORKTREE'; exit 2; }
done
for variable in DATABASE_URL DIRECT_URL SHADOW_DATABASE_URL PROD_DATABASE_URL REDIS_URL; do
  [[ -z "${!variable:-}" ]] || { echo "REFUSE_EXTERNAL_DATABASE_ENV:$variable"; exit 2; }
done
cd "$ROOT"
MIN_FREE_GIB="${GAFUS_MIN_FREE_GIB:-15}"
[[ "$MIN_FREE_GIB" =~ ^[0-9]+$ ]] || exit 2
FREE_KIB="$(df -Pk . | awk 'NR==2 {print $4}')"
[[ "$FREE_KIB" -ge $((MIN_FREE_GIB * 1024 * 1024)) ]] || {
  echo "LOW_DISK: free KiB $FREE_KIB, need $((MIN_FREE_GIB * 1024 * 1024)); do not force build"; exit 2;
}
OUT="$HOME/Library/Logs/gafus-refactor-regression/$RUN_ID"
[[ ! -e "$OUT/integration-final-results.tsv" ]] || {
  echo "RUN_ID_ALREADY_USED:$RUN_ID"; exit 2;
}
mkdir -p "$OUT"
SUMMARY="$OUT/integration-final-results.tsv"
printf 'gate\tstatus\n' > "$SUMMARY"
python3 scripts/qa/architecture-integration-fingerprint.py --root "$ROOT" --write "$OUT/source-before.json" > "$OUT/source-before.stdout"

run(){
  local gate="$1";shift
  printf 'START %s\n' "$gate"
  if "$@" > "$OUT/$gate.log" 2>&1;then
    printf '%s\tPASS\n' "$gate" >> "$SUMMARY";echo "PASS $gate"
  else
    local code=$?
    printf '%s\tFAIL_%s\n' "$gate" "$code" >> "$SUMMARY"
    tail -n 45 "$OUT/$gate.log" >&2
    echo "FAIL $gate exit=$code; see $OUT/$gate.log" >&2
    return "$code"
  fi
}
# Mandatory, read-only admission before any build/generate/test writes.
# Missing finalized A1 architecture registry or unapproved/stale lock is BLOCKED.
run integration-preflight node scripts/qa/architecture-integration-preflight.mjs \
  --policy "$ROOT/docs/audit/gafus-agents-integration-preflight-policy-20261112-r17.json" \
  --candidate "$ROOT"
run boundaries pnpm check:core-boundaries
run workspace-graph node scripts/check-workspace-graph.mjs
run release-workspace-contracts node --test ci-cd/scripts/release-graph.contract.test.mjs ci-cd/scripts/workspace-dependency-graph.contract.test.mjs
run prisma-generate pnpm --filter @gafus/prisma prisma:generate
run prisma-typecheck pnpm --filter @gafus/prisma typecheck
run logger-build pnpm --filter @gafus/logger build
run core-typecheck pnpm --filter @gafus/core typecheck
run api-typecheck pnpm --filter @gafus/api typecheck
run worker-typecheck pnpm --filter @gafus/worker typecheck
run consultation-core-targeted pnpm --filter @gafus/core exec vitest run src/services/consultation/bookingService.test.ts src/services/consultation/slotService.test.ts src/services/consultation/g1-moderator-core-deny.test.ts --reporter=dot
run api-architecture-targeted pnpm --filter @gafus/api exec vitest run src/modules/architecture/dependency-architecture.test.ts --reporter=dot
# A1 payment group: isolated functional contracts before expensive full build.
# Combined tree must contain A1 server composition; old Core payment reexports forbidden.
run payment-server-typecheck pnpm --filter @gafus/subscription-payment-server typecheck
run payment-core-contract pnpm --filter @gafus/core exec vitest run src/services/appSubscription/__tests__/paymentService.test.ts --config vitest.config.ts
run payment-server-jws-synthetic pnpm --filter @gafus/subscription-payment-server test
run payment-api-and-auth pnpm --filter @gafus/api exec vitest run src/routes/v1/app-subscription.route.test.ts src/routes/v1/payment-provider-webhooks.test.ts src/routes/v1/admin-users.test.ts src/modules/architecture/dependency-architecture.test.ts --config vitest.config.ts
run payment-worker-cron pnpm --filter @gafus/worker exec vitest run src/cron-scheduler.test.ts src/g1-consultation-outbox-core-cron-crossmodule.mock.test.ts --config vitest.config.ts
run core-server-facade-ratchet node scripts/check-core-server-facades.mjs
run web-auth-targeted pnpm --filter @gafus/web-vite exec vitest run src/shared/auth/PrincipalIsolation.test.tsx src/shared/auth/AuthPanel.test.tsx --reporter=dot
run a2-local-gates env A2_OBS_WITH_DB_RESTORE=1 A2_OBS_WITH_OTEL_BENCH=1 bash scripts/qa/observability-agent2-local-gates.sh
run a3-media-isolated bash scripts/qa/a3-jobs-media-isolated-acceptance.sh "a3-$RUN_ID"
# Performance on a shared localhost is not release A/B. Record failure and
# finish the functional gates; final status remains nonaccepted until staging.
A2_PERF_LOCAL_FAILURE=0
if run a2-real-multi-load-local bash scripts/qa/observability-real-multi-instance-isolated.sh;then
  echo 'A2_LOCAL_LOAD_OBSERVED_PASS_NOT_STAGING_AB'
else
  A2_PERF_LOCAL_FAILURE=1
  echo 'A2_LOCAL_LOAD_UNSTABLE_OR_FAIL: do not call final performance accepted'
fi
run all-33-final bash scripts/qa/architecture-final-regression.sh "$RUN_ID"
run all-5-chaos bash scripts/qa/architecture-chaos-local.sh "$RUN_ID"
run source-unchanged python3 scripts/qa/architecture-integration-fingerprint.py --root "$ROOT" --compare "$OUT/source-before.json"
echo '18_SCENARIOS_CLOUD_CDN_ALERT_DELIVERY_STAGING_AB_REMAIN_SEPARATE_EVIDENCE_GATES'
echo "FINISHED_LOCAL_FUNCTIONAL_CHECKS; $SUMMARY"
if [[ "$A2_PERF_LOCAL_FAILURE" == 1 ]]; then
  echo 'FINAL_STATUS_INCOMPLETE_LOCAL_PERFORMANCE_GATE_FAILED_STAGING_PENDING'
  exit 3
fi
echo 'FINAL_STATUS_LOCAL_TESTS_ONLY_STAGING_AND_RELEASE_AB_PENDING'
