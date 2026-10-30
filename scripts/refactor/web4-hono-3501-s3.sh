# WEB4 scoped copy of existing web1-hono-alt.sh. Only dedicated 3501 port and
# opt-in strictly guarded localhost MinIO mode; no third-party services.
#!/bin/zsh
# Opt-in original Hono with the project-local, restored PG18 WORKING COPY.
# The preserved restored snapshot is never used for API mutations.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
CLUSTER="$ROOT/.local-pg-scratch/production_snapshot_20261024/data"
SOCKET="$ROOT/.local-pg-scratch/production_snapshot_20261024/s"
DB=gafus_refactor_real_work_20261024
REDIS_DIR="$ROOT/.local-pg-scratch/redis-hono-20261024"
APP_ENV="$ROOT/.local-pg-scratch/production_snapshot_20261024/app.env"
SCRATCH="$ROOT/.local-pg-scratch"
PG_BIN=/opt/homebrew/opt/postgresql@18/bin/psql
REDIS_CLI=/opt/homebrew/bin/redis-cli
PNPM=/opt/homebrew/bin/pnpm
fail() { print -r -- "ISOLATED_HONO_PRECHECK_DENIED:$1" >&2; exit 23; }
[[ "${PWD:A}" == "$ROOT" ]] || fail cwd
[[ "$(git -C "$ROOT" rev-parse --show-toplevel)" == "$ROOT" ]] || fail git_root
[[ "$(git -C "$ROOT" branch --show-current)" == vite ]] || fail branch
case "${1:-}" in --preflight|--run|--preflight-local-s3|--run-local-s3) ;; *)
  print -r -- 'Usage: scripts/refactor/web4-hono-3501-s3.sh --init-local-secrets|--preflight|--run|--preflight-local-s3|--run-local-s3' >&2; exit 2;; esac
for p in "$ROOT" "$SCRATCH" "$CLUSTER" "$SOCKET"; do
  [[ -d "$p" && ! -L "$p" && "${p:A}" == "$p" ]] || fail project_paths
 done
[[ -x "$PG_BIN" && -x "$REDIS_CLI" && -x "$PNPM" ]] || fail tools
ACCESS="$SCRATCH/hono-local-access.secret"
REFRESH="$SCRATCH/hono-local-refresh.secret"
if [[ "$1" == --init-local-secrets ]]; then
  umask 077
  for f in "$ACCESS" "$REFRESH"; do
    [[ ! -L "$f" ]] || fail secret_symlink
    if [[ ! -e "$f" ]]; then
      /usr/bin/openssl rand -hex 32 > "$f" || fail secret_generation
      /bin/chmod 600 "$f"
    fi
  done
  print -r -- 'ISOLATED_HONO_SECRETS_READY (private; not printed)'
  exit 0
fi
[[ -d "$REDIS_DIR" && ! -L "$REDIS_DIR" && "${REDIS_DIR:A}" == "$REDIS_DIR" ]] || fail redis_directory
for f in "$ACCESS" "$REFRESH"; do
  [[ -f "$f" && ! -L "$f" ]] || fail secret_missing
  [[ "$(/usr/bin/stat -f '%Lp' "$f")" == 600 ]] || fail secret_permissions
  /usr/bin/grep -Eq '^[0-9a-f]{64}$' "$f" || fail secret_format
 done
pg() { /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin PGCONNECT_TIMEOUT=3 "$PG_BIN" -X -w -h "$SOCKET" -p 55921 -U asmtv1 -d "$DB" -At -v ON_ERROR_STOP=1 -c "$1"; }
identity=$(pg "SELECT current_database() || '|' || current_setting('server_version_num') || '|' || current_setting('data_directory') || '|' || current_setting('listen_addresses')") || fail postgres_unavailable
[[ "$identity" == "$DB|180004|$CLUSTER|127.0.0.1" ]] || fail postgres_identity
schema=$(pg "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'") || fail postgres_schema
[[ "$schema" -ge 160 ]] || fail postgres_schema
users=$(pg 'SELECT count(*) FROM "User"') || fail postgres_users
[[ "$users" -gt 0 ]] || fail empty_database
# app.env is a single DATABASE_URL line, mode 600, pointing solely at the
# non-superuser TCP LOGIN and WORK database. Never log or pass URL as argv.
[[ -f "$APP_ENV" && ! -L "$APP_ENV" && "$(/usr/bin/stat -f '%Lp' "$APP_ENV")" == 600 ]] || fail app_env_permissions
/usr/bin/python3 - "$APP_ENV" <<'PY_APP_ROLE'
import os,sys,subprocess
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
try:
    raw=Path(sys.argv[1]).read_text().strip()
    if not raw.startswith('DATABASE_URL=') or '\n' in raw:raise ValueError('format')
    url=urlsplit(raw.split('=',1)[1].strip().strip('"\''))
    if not (url.scheme=='postgresql' and url.hostname=='127.0.0.1' and url.port==55921 and
            url.path=='/gafus_refactor_real_work_20261024' and url.username=='gafus_refactor_local_real' and
            url.password and parse_qs(url.query)=={'schema':['public']} and not url.fragment):
        raise ValueError('restricted_target')
    env={'PATH':'/opt/homebrew/bin:/usr/bin:/bin','PGHOST':url.hostname,'PGPORT':str(url.port),
         'PGUSER':url.username,'PGPASSWORD':url.password,'PGDATABASE':url.path[1:],'PGCONNECT_TIMEOUT':'3'}
    query='SELECT current_user,current_database(),(SELECT count(*) FROM "User"),(SELECT count(*) FROM "Course")'
    run=subprocess.run(['/opt/homebrew/opt/postgresql@18/bin/psql','-XAt','-w','-v','ON_ERROR_STOP=1',
                        '-c',query],env=env,capture_output=True,text=True,timeout=7)
    if run.returncode or not run.stdout.startswith('gafus_refactor_local_real|gafus_refactor_real_work_20261024|'):
        raise ValueError('role_sql')
except Exception:
    print('ISOLATED_APP_ROLE_PREFLIGHT_DENIED',file=sys.stderr)
    sys.exit(23)
PY_APP_ROLE
[[ "$?" == 0 ]] || fail app_role
redis() { "$REDIS_CLI" -h 127.0.0.1 -p 55927 --raw "$@"; }
[[ "$(redis PING 2>/dev/null)" == PONG ]] || fail redis_not_running
[[ "$(redis CONFIG GET dir | tail -1)" == "$REDIS_DIR" ]] || fail redis_wrong_instance
[[ "$(redis CONFIG GET bind | tail -1)" == 127.0.0.1 ]] || fail redis_bind
[[ "$(redis CONFIG GET protected-mode | tail -1)" == yes ]] || fail redis_protection
[[ "$(redis CONFIG GET appendonly | tail -1)" == no ]] || fail redis_aof
[[ "$(redis CONFIG GET save | tail -1)" == '' ]] || fail redis_rdb
# Explicit owner-scoped original Hono outbox E2E modes, no production env.
# Only the one freshly prepared *project-local* synthetic USER may be scanned.
OUTBOX_ARGS=()
if [[ "$1" == --preflight-local-outbox || "$1" == --run-local-outbox-fault || "$1" == --run-local-outbox-recovery ]]; then
  LEASE="$SCRATCH/ag1-outbox-http-lease-20261025.private.json"
  [[ -f "$LEASE" && ! -L "$LEASE" && "${LEASE:A}" == "$LEASE" &&
    "$(/usr/bin/stat -f '%Lp' "$LEASE")" == 600 ]] || fail outbox_lease_file
  OWNER=$(/usr/bin/python3 - "$LEASE" <<'PY_OUTBOX_OWNER'
import json,re,sys
from pathlib import Path
x=json.loads(Path(sys.argv[1]).read_text())
o=x.get('ownerId');name=x.get('ownerUsername','')
if not isinstance(o,str) or not re.fullmatch(r'[a-z0-9]{20,40}',o) or not re.fullmatch(r'ag1_outbox_http_[a-z0-9]+_learner',name):sys.exit(21)
print(o)
PY_OUTBOX_OWNER
  ) || fail outbox_owner_shape
  # Verify physical restricted WORK ownership of the leased synthetic fixture;
  # never substitute another user or automatically search other databases.
  /usr/bin/python3 - "$APP_ENV" "$OWNER" <<'PY_OUTBOX_SCOPE' || fail outbox_owner_work
import os,subprocess,urllib.parse,sys
x=open(sys.argv[1]).read().strip().split('=',1)[-1];u=urllib.parse.urlparse(x)
assert (u.hostname,u.port,u.username,u.path)==('127.0.0.1',55921,'gafus_refactor_local_real','/gafus_refactor_real_work_20261024')
o=sys.argv[2];assert o.isalnum() and 20<=len(o)<=40
e={'PATH':'/opt/homebrew/bin:/usr/bin:/bin','PGHOST':u.hostname,'PGPORT':str(u.port),'PGUSER':u.username,'PGPASSWORD':u.password,'PGDATABASE':u.path[1:]}
r=subprocess.run(['/opt/homebrew/opt/postgresql@18/bin/psql','-XAt','-w','-v','ON_ERROR_STOP=1','-c',f"SELECT COUNT(*) FROM \"User\" WHERE id='{o}' AND username LIKE 'ag1_outbox_http_%_learner' AND role='USER'"],env=e,text=True,capture_output=True,timeout=7)
if r.returncode or r.stdout.strip()!='1':sys.exit(24)
PY_OUTBOX_SCOPE
  OUTBOX_ARGS=(GAFUS_BOUND_NOTIFICATION_OUTBOX_RECOVERY_USER_ID="$OWNER")
  if [[ "$1" == --run-local-outbox-fault ]]; then
    OUTBOX_ARGS+=(AG1_OUTBOX_FAULT_USER_ID="$OWNER" AG1_OUTBOX_FAULT_AFTER_SQL_COMMIT=1)
  elif [[ "$1" == --run-local-outbox-recovery ]]; then
    OUTBOX_ARGS+=(GAFUS_BOUND_NOTIFICATION_OUTBOX_RECOVERY=enabled GAFUS_BOUND_NOTIFICATION_OUTBOX_RECOVERY_TEST_ONLY=1)
  fi
fi
# Local S3 mode is a separate, explicit CLI entrypoint. Original --run never
# sets test-provider variables. Credential material is read by adapters directly
# from the fixed, mode-600 JSON under this project's private scratch tree.
S3_ARGS=()
if [[ "$1" == --preflight-local-s3 || "$1" == --run-local-s3 ]]; then
  S3_DIR="$SCRATCH/web4-nonprod-s3"
  S3_FILE="$S3_DIR/credentials.json"
  [[ -d "$S3_DIR" && ! -L "$S3_DIR" && "${S3_DIR:A}" == "$S3_DIR" &&
     "$(/usr/bin/stat -f '%Lp' "$S3_DIR")" == 700 ]] || fail isolated_s3_dir
  [[ -f "$S3_FILE" && ! -L "$S3_FILE" && "${S3_FILE:A}" == "$S3_FILE" &&
     "$(/usr/bin/stat -f '%Lp' "$S3_FILE")" == 600 ]] || fail isolated_s3_credentials
  /usr/bin/curl -fsS --connect-timeout 2 --max-time 3 \
    http://127.0.0.1:9500/minio/health/live >/dev/null || fail isolated_s3_runtime
  S3_ARGS=(
    GAFUS_LOCAL_MEDIA_HTTP_ACCEPTANCE=1
    CLOUDRU_MEDIA_JOBS_ENABLED=false
    GALLERY_ENABLED=true
    FEED_ENABLED=true
    FEED_PROCESSOR_READY=true
    GAFUS_ISOLATED_NONPROD_S3=enabled
    GAFUS_ISOLATED_S3_ENDPOINT=http://127.0.0.1:9500
    GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET=gafus-refactor-web4-documents-test
    GAFUS_ISOLATED_S3_QUESTIONS_BUCKET=gafus-refactor-web4-questions-test
    GAFUS_ISOLATED_S3_GALLERY_BUCKET=gafus-refactor-web4-gallery-test
    GAFUS_ISOLATED_S3_FEED_BUCKET=gafus-refactor-web4-feed-test
  )
fi
if /usr/sbin/lsof -nP -iTCP:3501 -sTCP:LISTEN 2>/dev/null | /usr/bin/grep -q LISTEN; then
  fail api_port_occupied
fi
print -r -- "ISOLATED_HONO_PREFLIGHT_OK host=127.0.0.1:3501 pg=project-snapshot:55921 working-db=$DB users=$users redis=127.0.0.1:55927/1"
[[ "$1" == --preflight || "$1" == --preflight-local-s3 || "$1" == --preflight-local-outbox ]] && exit 0
if [[ "$1" == --run || "$1" == --run-local-outbox-fault || "$1" == --run-local-outbox-recovery ]]; then
  S3_ARGS=(GALLERY_ENABLED=false FEED_ENABLED=false FEED_PROCESSOR_READY=false)
fi
# Start ONLY the existing original Hono. No credentials in env(1) argv or logs:
# a sanitized child shell reads the project-only mode-600 file itself.
exec /usr/bin/env -i \
  PATH=/opt/homebrew/bin:/usr/bin:/bin \
  HOME="$SCRATCH" TMPDIR="$SCRATCH/" \
  APP_ENV="$APP_ENV" ACCESS="$ACCESS" REFRESH="$REFRESH" \
  COREPACK_ENABLE_NETWORK=0 \
  NODE_ENV=development GAFUS_LOCAL_ISOLATED_API=1 GAFUS_LOCAL_BROWSER_AUTH=1 \
  API_HOST=127.0.0.1 API_PORT=3501 GAFUS_WEB4_ISOLATED_MEDIA=1 \
  REDIS_URL='redis://127.0.0.1:55927/1' \
  CDN_HEALTH_MONITOR_ENABLED=false \
  GALLERY_MEDIA_FALLBACK_ENABLED=false FEED_MEDIA_FALLBACK_ENABLED=false \
  "${S3_ARGS[@]}" "${OUTBOX_ARGS[@]}" \
  /bin/zsh -c '
    set -euo pipefail
    url_line=$(< "$APP_ENV")
    [[ "$url_line" == DATABASE_URL=* ]] || exit 23
    export DATABASE_URL="${url_line#DATABASE_URL=}"
    export JWT_SECRET="$(< "$ACCESS")"
    export JWT_REFRESH_SECRET="$(< "$REFRESH")"
    exec /opt/homebrew/bin/pnpm --filter @gafus/api exec tsx src/index.ts
  '
