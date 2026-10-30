#!/bin/zsh
# Mount the real registered Hono routes in the Vitest process; NO TCP API bind.
# Identical nonproduction WORK PG/role/secret constraints to AG1 preflight,
# deliberately omits ONLY the irrelevant exclusive API :3001 port check.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
SCRATCH="$ROOT/.local-pg-scratch"
SNAP="$SCRATCH/production_snapshot_20261024"
DB=gafus_refactor_real_work_20261024
APP_ENV="$SNAP/app.env"
ACCESS="$SCRATCH/hono-local-access.secret"
REFRESH="$SCRATCH/hono-local-refresh.secret"
fail(){ print -u2 "WEB1_MOUNTED_HONO_WORK_DENIED:$1"; exit 23; }
[[ "${PWD:A}" == "$ROOT" && "$(git -C "$ROOT" rev-parse --show-toplevel)" == "$ROOT" &&
  "$(git -C "$ROOT" branch --show-current)" == vite ]] || fail root_branch
for d in "$ROOT" "$SCRATCH" "$SNAP" "$SNAP/data" "$SNAP/s" "$ROOT/apps/api"; do
 [[ -d "$d" && ! -L "$d" && "${d:A}" == "$d" ]] || fail safe_paths
done
for f in "$APP_ENV" "$ACCESS" "$REFRESH"; do
 [[ -f "$f" && ! -L "$f" && "${f:A}" == "$f" &&
  "$(/usr/bin/stat -f '%Lp' "$f")" == 600 ]] || fail safe_private_file
done
/usr/bin/grep -Eq '^[0-9a-f]{64}$' "$ACCESS" || fail access_secret
/usr/bin/grep -Eq '^[0-9a-f]{64}$' "$REFRESH" || fail refresh_secret
[[ -x /opt/homebrew/opt/postgresql@18/bin/psql ]] || fail psql_missing
identity=$(/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin PGCONNECT_TIMEOUT=3 \
 /opt/homebrew/opt/postgresql@18/bin/psql -XAt -w -v ON_ERROR_STOP=1 \
 -h "$SNAP/s" -p 55921 -U asmtv1 -d "$DB" \
 -c "SELECT current_database() || '|' || current_setting('server_version_num') || '|' || current_setting('data_directory') || '|' || current_setting('listen_addresses')") || fail snapshot_identity_sql
[[ "$identity" == "$DB|180004|$SNAP/data|127.0.0.1" ]] || fail postgres_identity
/usr/bin/python3 - "$APP_ENV" <<'PY_VALIDATE' || fail app_role
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
import sys,subprocess
raw=Path(sys.argv[1]).read_text().strip()
if not raw.startswith('DATABASE_URL=') or '\n' in raw:sys.exit(20)
u=urlsplit(raw.split('=',1)[1].strip().strip('"\''))
if (u.scheme,u.hostname,u.port,u.username,u.path,parse_qs(u.query)) != (
 'postgresql','127.0.0.1',55921,'gafus_refactor_local_real',
 '/gafus_refactor_real_work_20261024',{'schema':['public']}):sys.exit(21)
if not u.password or u.fragment:sys.exit(22)
env={'PATH':'/opt/homebrew/bin:/usr/bin:/bin','PGHOST':u.hostname,
'PGPORT':str(u.port),'PGUSER':u.username,'PGPASSWORD':u.password,
'PGDATABASE':u.path[1:],'PGCONNECT_TIMEOUT':'3'}
r=subprocess.run(['/opt/homebrew/opt/postgresql@18/bin/psql','-XAt','-w','-v',
 'ON_ERROR_STOP=1','-c','SELECT current_user,current_database(),(SELECT count(*) FROM "User")'],
 env=env,capture_output=True,text=True,timeout=9)
if r.returncode or not r.stdout.startswith('gafus_refactor_local_real|gafus_refactor_real_work_20261024|'):
 sys.exit(23)
PY_VALIDATE
print -r -- 'WEB1_MOUNTED_HONO_WORK_PREFLIGHT_OK (no TCP bind; restricted PG role)'
[[ "${1:-}" == "--preflight" ]] && exit 0
[[ -z "${1:-}" || "${1:-}" == "--run" ]] || fail mode
cd "$ROOT/apps/api"
exec /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$SCRATCH" TMPDIR="$SCRATCH/" \
 APP_ENV="$APP_ENV" ACCESS="$ACCESS" REFRESH="$REFRESH" COREPACK_ENABLE_NETWORK=0 \
 NODE_ENV=development GAFUS_LOCAL_ISOLATED_API=1 GAFUS_LOCAL_BROWSER_AUTH=1 \
 GAFUS_WEB1_ISOLATED_REMINDER_HONO_TEST=1 API_HOST=127.0.0.1 API_PORT=3001 \
 /bin/zsh -c '
 set -euo pipefail
 line=$(< "$APP_ENV"); [[ "$line" == DATABASE_URL=* ]] || exit 23
 export DATABASE_URL="${line#DATABASE_URL=}" JWT_SECRET="$(< "$ACCESS")" JWT_REFRESH_SECRET="$(< "$REFRESH")"
 exec /opt/homebrew/bin/pnpm exec vitest run --config vitest.config.ts \
  src/routes/v1/reminders-web1-isolated-work.integration.test.ts --maxWorkers=1 --reporter=dot
 '
