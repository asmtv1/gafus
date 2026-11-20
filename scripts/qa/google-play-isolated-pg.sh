#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
if [[ -d /opt/homebrew/opt/postgresql@18/bin ]]; then
  export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
fi
dir="$(mktemp -d /tmp/gafus-google-isolated.XXXXXX)"
started=0
cleanup() {
  if [[ "$started" == 1 ]]; then pg_ctl -D "$dir/pg" -m immediate stop >/dev/null 2>&1 || true; fi
  if [[ "$dir" == /tmp/gafus-google-isolated.* && ! -L "$dir" ]]; then rm -rf -- "$dir"; fi
}
trap cleanup EXIT
port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
db="gafus_refactor_google_isolated_$port"
initdb -D "$dir/pg" -A trust -U qa --no-instructions > "$dir/init.log"
pg_ctl -D "$dir/pg" -l "$dir/pg.log" -o "-h 127.0.0.1 -p $port" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$port" -U qa "$db"
export DATABASE_URL="postgresql://qa:isolated@127.0.0.1:$port/$db?schema=public"
export GAFUS_API_REALPG_ISOLATED=1 GAFUS_GOOGLE_PLAY_TEST_ISOLATED=1 NODE_ENV=test

# Materialize the schema before this migration, then apply the real migration to it.
python3 - "$dir/previous.prisma" <<'PY'
import sys
from pathlib import Path
lines = Path("packages/prisma/schema.prisma").read_text().splitlines()
Path(sys.argv[1]).write_text("\n".join(line for line in lines if "googlePlay" not in line and line.strip() != "GOOGLE_PLAY") + "\n")
PY
pnpm --dir packages/prisma exec prisma db push --schema "$dir/previous.prisma" --skip-generate
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$port" -U qa -d "$db" -f packages/prisma/migrations/20261120120000_google_play_subscriptions/migration.sql
pnpm --dir apps/api exec vitest run --config vitest.realpg.config.ts __tests__/google-play-service.realpg.test.ts
