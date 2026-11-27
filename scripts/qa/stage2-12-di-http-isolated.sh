#!/bin/bash
# Local synthetic-only stage 2/12 acceptance. No real mail/provider credentials.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
if [[ "${GAFUS_DI12_QA:-}" != 1 ]]; then echo "EXPLICIT_LOCAL_QA_REQUIRED"; exit 2; fi
for key in $(env | cut -d= -f1); do
  case "$key" in DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL|REDIS_URL|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|JWT_SECRET|JWT_REFRESH_SECRET|MAIL_*|YOOKASSA_*|APPLE_*|AWS_*|S3_*|CLOUDRU_*|CLOUD_RU_*|RESEND_*|SMTP_*|FCM_*|APNS_*|VK_*|BEGET_*|YANDEX_*|UPTRACE_*|TELEGRAM_*) unset "$key";; esac
done
export LC_ALL=C
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb redis-server redis-cli python3 openssl; do command -v "$bin" >/dev/null || exit 2; done
umask 077
D="$(mktemp -d /tmp/gafus-di12-http.XXXXXXXX)"
RPID=''
cleanup() {
  rc=$?
  trap - EXIT INT TERM
  if [[ -n "$RPID" ]]; then kill -CONT "$RPID" 2>/dev/null || true; kill -TERM "$RPID" 2>/dev/null || true; wait "$RPID" 2>/dev/null || true; fi
  if [[ -e "$D/pg/postmaster.pid" ]]; then pg_ctl -D "$D/pg" -m immediate -w stop >/dev/null 2>&1 || rc=2; fi
  if [[ "$rc" != 0 ]]; then for f in init.log pg.log schema.log redis.log; do if [[ -f "$D/$f" ]]; then echo "=== $f"; tail -15 "$D/$f"; fi; done; fi
  if [[ "$D" == /tmp/gafus-di12-http.* && ! -L "$D" && ! -e "$D/pg/postmaster.pid" ]]; then rm -rf "$D"; echo DI12_OWNED_RESOURCES_REMOVED; else rc=2; fi
  exit "$rc"
}
trap cleanup EXIT INT TERM
port(){ python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'; }
P="$(port)"; R="$(port)"; [[ "$P" != "$R" ]]
DB="di12_$(openssl rand -hex 6)"
initdb -D "$D/pg" -A trust -U di12 --locale=C --encoding=UTF8 --no-instructions >"$D/init.log" 2>&1
pg_ctl -D "$D/pg" -l "$D/pg.log" -o "-h 127.0.0.1 -p $P -k $D -c max_connections=30 -c shared_buffers=32MB" -w start
createdb -h 127.0.0.1 -p "$P" -U di12 "$DB"
mkdir "$D/redis"
redis-server --bind 127.0.0.1 --port "$R" --protected-mode yes --save '' --appendonly no --dir "$D/redis" --daemonize no >"$D/redis.log" 2>&1 &
RPID=$!
for i in $(seq 1 60); do if redis-cli -h 127.0.0.1 -p "$R" ping 2>/dev/null | grep -q PONG; then break; fi; sleep .1; done
redis-cli -h 127.0.0.1 -p "$R" ping | grep -q PONG
export DATABASE_URL="postgresql://di12@127.0.0.1:$P/$DB?schema=public&connect_timeout=3&pool_timeout=3"
export REDIS_URL="redis://127.0.0.1:$R/0" JWT_SECRET="$(openssl rand -hex 32)" JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export NODE_ENV=test GAFUS_LOCAL_ISOLATED_API=1 FEED_ENABLED=false GALLERY_ENABLED=false CDN_HEALTH_MONITOR_ENABLED=false CLOUDRU_MEDIA_JOBS_ENABLED=false GAFUS_BOUND_NOTIFICATION_OUTBOX_RECOVERY=disabled
export DI12_DIR="$D" DI12_PG_PORT="$P" DI12_REDIS_PID="$RPID" DI12_REDIS_PORT="$R"
export NODE_OPTIONS="--require $ROOT/scripts/qa/block-nonlocal-network.cjs"
(cd packages/prisma && pnpm exec prisma db push --skip-generate >"$D/schema.log" 2>&1)
(cd apps/api && node --import tsx src/test/stage2-12-di-http.acceptance.mts)
