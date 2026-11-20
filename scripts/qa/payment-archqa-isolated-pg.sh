#!/usr/bin/env bash
# Payment replay/refund QA: auto-provisioned loopback PostgreSQL, no live providers.
set -Eeuo pipefail
# Never inherit real payment/CDN/queue provider credentials into disposable QA.
for key in $(env | cut -d= -f1); do
  case "$key" in
    YOOKASSA_*|APPLE_*|AWS_*|S3_*|CLOUDRU_*|REDIS_URL|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|DIRECT_URL|SHADOW_DATABASE_URL)
      unset "$key" ;;
  esac
done
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb python3; do command -v "$bin" >/dev/null || { echo "PAYMENT_ARCHQA_TOOL_MISSING $bin"; exit 2; }; done
DIR="$(mktemp -d /tmp/gafus-payment-archqa-pg.XXXXXX)"; umask 077
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
DB_NAME="$(python3 -c 'import secrets;print("archqa_schema_"+secrets.token_hex(6))')"
started=0
cleanup() { if [[ "$started" == 1 ]]; then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true; fi; if [[ "$DIR" == /tmp/gafus-payment-archqa-pg.* && ! -L "$DIR" ]]; then rm -rf -- "$DIR"; fi; }
trap cleanup EXIT INT TERM
initdb -D "$DIR/pg" -A trust -U qapayment --no-instructions >"$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/server.log" -o "-h 127.0.0.1 -p $PORT" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U qapayment "$DB_NAME"
unset DIRECT_URL SHADOW_DATABASE_URL
export DATABASE_URL="postgresql://qapayment@127.0.0.1:$PORT/$DB_NAME?schema=public"
export GAFUS_ARCHQA_REALPG=1 GAFUS_ARCHQA_DB_NAME="$DB_NAME" NODE_ENV=test
(cd packages/prisma && pnpm exec prisma db push --skip-generate > "$DIR/schema.log" 2>&1) || { tail -55 "$DIR/schema.log"; exit 1; }
coverage_dir="${GAFUS_QA_COVERAGE_DIR:-}"
core_coverage_args=()
subscription_coverage_args=()
if [[ -n "$coverage_dir" ]]; then
  [[ "$coverage_dir" == "$ROOT/.qa/testing/"* && "$coverage_dir" != *..* && ! -L "$coverage_dir" ]] || { echo 'PAYMENT_QA_UNSAFE_COVERAGE_DIR'; exit 2; }
  mkdir -p "$coverage_dir/core" "$coverage_dir/subscriptions"
  core_coverage_args=(--coverage --coverage.provider=v8 --coverage.allowExternal
    "--coverage.include=$ROOT/packages/subscription-payment-server/src/paymentService.ts"
    --coverage.reporter=json-summary --coverage.reporter=json --coverage.reporter=lcov
    "--coverage.reportsDirectory=$coverage_dir/core")
  subscription_coverage_args=(--coverage --coverage.provider=v8
    --coverage.include=src/appleSubscriptionState.ts
    --coverage.include=src/subscriptionTransitions.ts
    --coverage.reporter=json-summary --coverage.reporter=json --coverage.reporter=lcov
    "--coverage.reportsDirectory=$coverage_dir/subscriptions")
fi
report_path="${GAFUS_TEST_REPORT_PATH:-}"
if [[ -n "$report_path" ]]; then
  [[ "$report_path" == "$ROOT/.qa/testing/"* && "$report_path" == */tests.json && "$report_path" != *..* && ! -L "$report_path" ]] || { echo 'PAYMENT_FAULT_QA_UNSAFE_REPORT_PATH'; exit 2; }
  payment_config=vitest.archqa-payment.realpg.config.ts
  if [[ -n "$coverage_dir" ]];then payment_config=vitest.archqa-payment.coverage.realpg.config.ts;fi
  if [[ -n "$coverage_dir" ]]; then
    pnpm --filter @gafus/core exec vitest run --config "$payment_config" --reporter=json --outputFile="$DIR/core.json" "${core_coverage_args[@]}"
    pnpm --filter @gafus/subscription-payment-server exec vitest run --config vitest.apple-state-realpg.config.ts --reporter=json --outputFile="$DIR/subscriptions.json" "${subscription_coverage_args[@]}"
  else
    # macOS Bash 3.2 + set -u treats an empty array expansion as unbound.
    pnpm --filter @gafus/core exec vitest run --config "$payment_config" --reporter=json --outputFile="$DIR/core.json"
    pnpm --filter @gafus/subscription-payment-server exec vitest run --config vitest.apple-state-realpg.config.ts --reporter=json --outputFile="$DIR/subscriptions.json"
  fi
  # Both independent Vitest processes must succeed before merging case results.
  node - "$DIR/core.json" "$DIR/subscriptions.json" "$report_path" <<'NODE'
const fs=require('node:fs');
const [a,b,out]=process.argv.slice(2);
const runs=[a,b].map(f=>JSON.parse(fs.readFileSync(f,'utf8')));
fs.writeFileSync(out,JSON.stringify({testResults:runs.flatMap(r=>r.testResults||[]),
  numPassedTests:runs.reduce((s,r)=>s+(r.numPassedTests||0),0),
  numFailedTests:runs.reduce((s,r)=>s+(r.numFailedTests||0),0),
  numPendingTests:runs.reduce((s,r)=>s+(r.numPendingTests||0),0)},null,2)+'\n');
NODE
else
  pnpm --filter @gafus/core exec vitest run --config vitest.archqa-payment.realpg.config.ts
  pnpm --filter @gafus/subscription-payment-server exec vitest run --config vitest.apple-state-realpg.config.ts
fi
