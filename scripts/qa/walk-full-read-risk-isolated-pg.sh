#!/usr/bin/env bash
# Compare baseline/proposed SQL, optionally build just tracking-server, then
# verify the actual mounted route and existing delta profile on this one cluster.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
if [[ "${WALK_RISK_CLEAN_ENV:-}" != 1 ]]; then
  exec env -i HOME="$HOME" PATH="$PATH" WALK_RISK_CLEAN_ENV=1 bash "$0" "$@"
fi
export LC_ALL=C LANG=C TZ=UTC PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
OUT="${1:?absolute output directory required}"
MODE="${2:-verify}"
[[ "$OUT" == /* && ! -e "$OUT" ]] || exit 2
[[ "$MODE" == verify || "$MODE" == apply ]] || exit 2
BASE=a73b0b62532837da0b00bd44199b983aa496f661
export GAFUS_WALK_RISK_BASE_SHA="$BASE"
git merge-base --is-ancestor "$BASE" HEAD
if [[ "$MODE" == apply ]]; then
  [[ "$(git rev-parse HEAD)" == "$BASE" && "$(git branch --show-current)" == qa/stage5-walk-full-read-20261128 ]] || exit 2
  git diff --quiet "$BASE" -- packages/tracking-server/src/walksService.ts packages/tracking-server/src/walksService.test.ts
fi
for b in initdb pg_ctl createdb psql python3 pnpm; do command -v "$b" >/dev/null; done
umask 077
DIR="$(mktemp -d /tmp/gafus-walks-load-pg.XXXXXXXX)"
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
mkdir "$OUT"
cleanup(){
  if [[ -f "$DIR/pg/postmaster.pid" ]]; then pg_ctl -D "$DIR/pg" -m immediate -w stop >/dev/null 2>&1 || true; fi
  for f in full-read-plan.json walk-delta-profile.json; do [[ ! -f "$DIR/$f" ]] || cp "$DIR/$f" "$OUT/$f"; done
  if [[ "$DIR" == /tmp/gafus-walks-load-pg.* && -d "$DIR" && ! -L "$DIR" ]]; then rm -rf -- "$DIR"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
initdb -D "$DIR/pg" -A trust -U qacourse --no-instructions --no-sync >"$DIR/init.log" 2>&1 || { tail -40 "$DIR/init.log"; exit 1; }
pg_ctl -D "$DIR/pg" -l "$DIR/pg.log" -o "-h 127.0.0.1 -p $PORT -k $DIR -c timezone=UTC -c shared_buffers=32MB -c max_connections=25" -w -t 120 start >/dev/null || { tail -40 "$DIR/pg.log"; exit 1; }
createdb -h 127.0.0.1 -p "$PORT" -U qacourse gafus_fresh_walks_load
export GAFUS_FRESH_BOOTSTRAP_CONFIRM=gafus_fresh_walks_load
export DATABASE_URL="postgresql://qacourse@127.0.0.1:$PORT/gafus_fresh_walks_load?schema=public"
export NODE_ENV=test GAFUS_LOCAL_ISOLATED_API=1 GAFUS_WALKS_LOAD_REAL_PG=1
export GAFUS_WALKS_LOAD_PG_DIR="$DIR/pg" GAFUS_WALKS_LOAD_PG_PORT="$PORT"
export GAFUS_WALKS_LOAD_REPORT="$DIR/../unused"
echo "WALK_FULL_READ_ISOLATED_PORT=$PORT"
(bash packages/prisma/scripts/bootstrap-fresh-postgres.sh >"$DIR/schema.log" 2>&1) || { tail -60 "$DIR/schema.log"; exit 1; }
export DATABASE_URL="$DATABASE_URL&connection_limit=4"
(cd apps/api && pnpm exec tsx scripts/qa/walk-full-read-plan.smoke.ts compare)
if [[ "$MODE" == apply ]]; then
  python3 - "$DIR/full-read-plan.json" <<'PY'
import json,sys
from pathlib import Path
d=json.load(open(sys.argv[1]))
if not d["reproduced"]:
    print("BASELINE_EXTRA_LOOPS_NOT_REPRODUCED_NO_PRODUCT_CHANGE")
elif not d["onePass"]:
    raise SystemExit("PROPOSED_PLAN_NOT_ONE_PASS_NO_PRODUCT_CHANGE")
else:
    p=Path("packages/tracking-server/src/walksService.ts")
    s=p.read_text()
    old='WHERE w."userId" = ${ownerId} AND NOT EXISTS (\n      SELECT 1 FROM "DogWalkTombstone" d WHERE d."userId" = w."userId" AND d."clientId" = w."clientId"'
    new='WHERE w."userId" = ${ownerId} AND w."clientId" NOT IN (\n      SELECT d."clientId" FROM "DogWalkTombstone" d WHERE d."userId" = ${ownerId}'
    assert s.count(old)==1
    s=s.replace(old,new)
    s=s.replace('  const rows = await db.$queryRaw<WalkRow[]>','  // Both clientId columns are NOT NULL. Read the owner-local exclusion set\n  // once in this SQL snapshot, before sorting/limiting the visible walks.\n  const rows = await db.$queryRaw<WalkRow[]>',1)
    p.write_text(s)
    p=Path("packages/tracking-server/src/walksService.test.ts")
    s=p.read_text()
    old="    expect(mocked.query.mock.calls[0][0].join(\"?\")).toContain('NOT EXISTS');"
    assert s.count(old)==1
    s=s.replace(old,'''    const [historySql, historyOwner, tombstoneOwner] = mocked.query.mock.calls[0];
    expect(historyOwner).toBe("jwt-actor");
    expect(tombstoneOwner).toBe(historyOwner);
    expect(historySql.join("?")).toContain('w."clientId" NOT IN (');
    expect(historySql.join("?")).toContain('SELECT d."clientId" FROM "DogWalkTombstone" d WHERE d."userId" = ?');
    expect(historySql.join("?")).toContain(') ORDER BY w."startedAt" DESC, w."clientId" DESC LIMIT 2000');''')
    p.write_text(s)
    print("WALK_FULL_READ_PRODUCT_PATCH_APPLIED")
PY
fi
# One targeted build. No Turbo or monorepo rebuild.
(cd packages/tracking-server && pnpm run build && pnpm exec vitest run --config vitest.config.ts --maxWorkers=1 src/walksService.test.ts)
(cd apps/api && pnpm exec tsx scripts/qa/walk-full-read-plan.smoke.ts verify)
export GAFUS_WALKS_LOAD_REPORT="$DIR/pg/../walk-delta-profile.json" GAFUS_WALKS_LOAD_DELTA_ONLY=1
(cd apps/api && pnpm exec tsx scripts/qa/walks-local-load.smoke.ts)
echo WALK_FULL_READ_RISK_PROFILE_PASS
