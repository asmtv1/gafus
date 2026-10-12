#!/usr/bin/env bash
set -euo pipefail
script="$(cd "$(dirname "$0")" && pwd)/production-schema-cutover.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/project/ci-cd/nginx/conf.d" "$tmp/release"
export DEPLOY_ROOT="$tmp/project"
export COMPOSE_PROD="$DEPLOY_ROOT/ci-cd/docker/docker-compose.prod.yml"
export RELEASE_BACKUP_DIR="$tmp/release"
export MOCK_DIR="$tmp"
export PATH="$tmp/bin:$PATH"
echo running > "$MOCK_DIR/state"

cat > "$tmp/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -eu
case "$1" in
  exec)
    case "$3" in
      pg_dump) printf 'SYNTHETIC-DUMP-NOT-A-REAL-BACKUP';;
      pg_restore) cat >/dev/null ;;
    esac ;;
  inspect)
    if [[ "$*" == *Health* ]]; then
      [[ "$(cat "$MOCK_DIR/state")" = running ]] && echo healthy || echo stopped
    else
      [[ "$(cat "$MOCK_DIR/state")" = running ]] && echo true || echo false
    fi ;;
  *) echo "unexpected docker: $*" >&2; exit 1 ;;
esac
MOCK
cat > "$tmp/bin/docker-compose" <<'MOCK'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$MOCK_DIR/events"
case "$*" in
  *" stop "*) echo stopped > "$MOCK_DIR/state" ;;
  *" run "*) [[ "$(cat "$MOCK_DIR/state")" = stopped ]] || exit 1
              [[ -f "$DEPLOY_ROOT/ci-cd/nginx/conf.d/.release-maintenance" ]] || exit 1
              [[ "${MOCK_MIGRATION_FAIL:-}" != 1 ]] || exit 31 ;;
  *" up "*) echo running > "$MOCK_DIR/state" ;;
  *) echo "unexpected compose: $*" >&2; exit 1 ;;
esac
MOCK
cat > "$tmp/bin/curl" <<'MOCK'
#!/usr/bin/env bash
[[ -f "$DEPLOY_ROOT/ci-cd/nginx/conf.d/.release-maintenance" ]] && echo 503 || echo 200
MOCK
printf '#!/usr/bin/env bash\nexit 0\n' > "$tmp/bin/sleep"
chmod +x "$tmp"/bin/*

bash "$script" prepare
[[ "$(cat "$MOCK_DIR/state")" = stopped ]]
[[ -s "$RELEASE_BACKUP_DIR/database-backup-path" ]]
bash "$script" migrate
[[ -f "$RELEASE_BACKUP_DIR/migration-started" ]]
[[ -f "$RELEASE_BACKUP_DIR/migration-complete" ]]
bash "$script" start
bash "$script" verify
bash "$script" open
[[ ! -f "$DEPLOY_ROOT/ci-cd/nginx/conf.d/.release-maintenance" ]]
echo 'PASS: gated 503 -> stop writers -> backup -> migrate -> healthy new apps -> open.'

echo running > "$MOCK_DIR/state"
mkdir -p "$tmp/release2"
export RELEASE_BACKUP_DIR="$tmp/release2"
bash "$script" prepare
if MOCK_MIGRATION_FAIL=1 bash "$script" migrate >/dev/null 2>&1; then
  echo 'ERROR: intentional Prisma failure unexpectedly succeeded' >&2
  exit 1
fi
[[ -f "$RELEASE_BACKUP_DIR/migration-started" ]]
[[ ! -f "$RELEASE_BACKUP_DIR/migration-complete" ]]
[[ -f "$DEPLOY_ROOT/ci-cd/nginx/conf.d/.release-maintenance" ]]
[[ "$(cat "$MOCK_DIR/state")" = stopped ]]
echo 'PASS: injected Prisma failure keeps maintenance enabled, no old processes restarted.'
