#!/usr/bin/env bash
# Disposable local PostgreSQL; never connects to a shared, remote or production DB.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb python3; do command -v "$bin" >/dev/null || { echo "TRAINING_ATOMIC_TOOL_MISSING: $bin"; exit 2; }; done
DIR="$(mktemp -d /tmp/gafus-training-atomic-pg.XXXXXX)"
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
DB_NAME="$(python3 -c 'import secrets;print("training_atomic_"+secrets.token_hex(6))')"
started=0
cleanup() { if [[ "$started" == 1 ]]; then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true; fi; if [[ "$DIR" == /tmp/gafus-training-atomic-pg.* && ! -L "$DIR" ]]; then rm -rf -- "$DIR"; fi; }
trap cleanup EXIT INT TERM
initdb -D "$DIR/pg" -A trust -U qatran --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/server.log" -o "-h 127.0.0.1 -p $PORT" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U qatran "$DB_NAME"
unset DIRECT_URL SHADOW_DATABASE_URL
export DATABASE_URL="postgresql://qatran@127.0.0.1:$PORT/$DB_NAME?schema=public"
export GAFUS_TRAINING_ATOMIC_PG=1 GAFUS_TRAINING_ATOMIC_DB_NAME="$DB_NAME" NODE_ENV=test
(cd packages/prisma && pnpm exec prisma db push --skip-generate > "$DIR/schema.log" 2>&1) || { tail -55 "$DIR/schema.log"; exit 1; }
# JSON evidence is opt-in. A bare shell invocation retains its existing runner.
report_path="${GAFUS_TEST_REPORT_PATH:-${VITEST_REPORT_PATH:-}}"
if [[ -n "$report_path" ]]; then
  [[ "$report_path" == /* ]] || { echo 'Test report path must be absolute'; exit 2; }
  pnpm --filter @gafus/course-progress-server exec vitest run --config vitest.config.ts \
    src/trainingAtomic.realpg.test.ts --reporter=json --outputFile="$report_path"
else
  # macOS ships Bash 3.2, where an empty array under `set -u` can abort the
  # command expansion without executing Vitest, yet return status 0.
  pnpm --filter @gafus/course-progress-server exec vitest run --config vitest.config.ts \
    src/trainingAtomic.realpg.test.ts
fi
# This sentinel is emitted strictly after the test process itself exits 0.
# The parent chaos harness must require it, never infer PASS from Bash alone.
printf 'TRAINING_ATOMIC_REAL_PG_RUN_PASS\n'
