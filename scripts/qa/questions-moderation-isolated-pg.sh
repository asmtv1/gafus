#!/bin/bash
# Isolated, disposable PostgreSQL ownership/replay verification. No production I/O.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb python3; do command -v "$bin" >/dev/null || { echo "QUESTIONS_MODERATION_QA_TOOL_MISSING:$bin"; exit 2; }; done
DIR="$(mktemp -d /tmp/gafus-question-moderation-q-pg.XXXXXX)"
umask 077
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
cleanup() {
  if [ "$started" = "1" ]; then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true; fi
  if [[ "$DIR" == /tmp/gafus-question-moderation-q-pg.* ]] && [ ! -L "$DIR" ]; then rm -rf -- "$DIR"; fi
}
trap cleanup EXIT INT TERM
initdb -D "$DIR/pg" -A trust -U qmoderationqa --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/server.log" -o "-h 127.0.0.1 -p $PORT -c TimeZone=Pacific/Auckland" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U qmoderationqa gafus_questions_qa_moderation
export DATABASE_URL="postgresql://qmoderationqa@127.0.0.1:$PORT/gafus_questions_qa_moderation?schema=public"
export QUESTIONS_TEST_DATABASE_URL="$DATABASE_URL"
export NODE_ENV=test GAFUS_LOCAL_ISOLATED_API=1
(cd packages/prisma && pnpm exec prisma db push --skip-generate > "$DIR/schema.log" 2>&1) || { tail -55 "$DIR/schema.log"; exit 1; }
# Strict local-only network fence; off-machine Cloud.ru/S3/CDN calls are forbidden.
export NODE_OPTIONS="${NODE_OPTIONS:-} --require $ROOT/scripts/qa/block-nonlocal-network.cjs"
pnpm --filter @gafus/questions-server exec vitest run --config vitest.config.ts src/questions.integration.test.ts --maxWorkers=1
echo 'QUESTIONS_MODERATION_REAL_PG_PASS: disposable PostgreSQL, owner ACL, role checks, question blocks and undo'
