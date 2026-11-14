#!/usr/bin/env bash
set -euo pipefail
script="$(cd "$(dirname "$0")" && pwd)/production-schema-cutover.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/project/ci-cd/nginx/conf.d" "$tmp/project/ci-cd/scripts" "$tmp/project/packages/prisma/migrations" "$tmp/release"
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
      psql)
        [[ "$*" == *'SELECT migration_name, checksum'* ]] || exit 1
        cat "$MOCK_DIR/ledger.tsv" ;;
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

# Rehearse the exact read-only production ledger preflight with isolated SQL.
# No test connects to a live database or needs production credentials.
cp "$(dirname "$script")/verify-production-migration-ledger.py" \
  "$DEPLOY_ROOT/ci-cd/scripts/verify-production-migration-ledger.py"
python3 - "$tmp" <<'PY_LEDGER_FIXTURE'
import hashlib, pathlib, sys
base=pathlib.Path(sys.argv[1]);root=base/'project/packages/prisma/migrations'
rows=[]
for i in range(163):
  name=f'20260101000000_synthetic_{i:03d}'
  sql=f'CREATE TABLE synthetic_{i} (id INTEGER);\n'
  path=root/name;path.mkdir();(path/'migration.sql').write_text(sql)
  rows.append(f'{name}\t{hashlib.sha256(sql.encode()).hexdigest()}\tapplied')
(base/'ledger.tsv').write_text('\n'.join(rows)+'\n')
PY_LEDGER_FIXTURE
cp "$tmp/ledger.tsv" "$tmp/good-ledger.tsv"
python3 - "$tmp/ledger.tsv" <<'PY_CORRUPT_LEDGER'
import pathlib,sys
p=pathlib.Path(sys.argv[1]);rows=p.read_text().splitlines()
parts=rows[0].split('\t');parts[1]='manual';rows[0]='\t'.join(parts)
p.write_text('\n'.join(rows)+'\n')
PY_CORRUPT_LEDGER
if bash "$script" preflight > "$tmp/rejected-ledger.log" 2>&1; then
  echo 'ERROR: corrupted production ledger passed preflight' >&2;exit 1
fi
grep -q 'PRODUCTION_MIGRATION_LEDGER_VETO:NONSTANDARD_MIGRATION_CHECKSUM' "$tmp/rejected-ledger.log"
[[ "$(cat "$MOCK_DIR/state")" == running ]]
[[ ! -e "$DEPLOY_ROOT/ci-cd/nginx/conf.d/.release-maintenance" ]]
[[ ! -e "$RELEASE_BACKUP_DIR/migration-started" ]]
mv "$tmp/good-ledger.tsv" "$tmp/ledger.tsv"
bash "$script" preflight

# Legacy rollback checkout can be missing both the new verifier and its
# preflight mode; only the current verified control snapshot supplies them.
cp "$script" "$tmp/control-schema-cutover.sh"
cp "$DEPLOY_ROOT/ci-cd/scripts/verify-production-migration-ledger.py" \
  "$tmp/control-migration-ledger.py"
rm "$DEPLOY_ROOT/ci-cd/scripts/verify-production-migration-ledger.py"
cat > "$DEPLOY_ROOT/ci-cd/scripts/production-schema-cutover.sh" <<'LEGACY'
#!/usr/bin/env bash
case "${1:-}" in
  prepare|migrate|start|verify|open) exit 0 ;;
  *) echo 'legacy release: no preflight mode' >&2; exit 2 ;;
esac
LEGACY
if bash "$DEPLOY_ROOT/ci-cd/scripts/production-schema-cutover.sh" preflight >/dev/null 2>&1; then
  echo 'ERROR: legacy target unexpectedly provides current preflight' >&2;exit 1
fi
GAFUS_MIGRATION_LEDGER_VERIFIER_PATH="$tmp/control-migration-ledger.py" \
  bash "$tmp/control-schema-cutover.sh" preflight
cp "$tmp/control-migration-ledger.py" \
  "$DEPLOY_ROOT/ci-cd/scripts/verify-production-migration-ledger.py"
echo 'PASS: legacy rollback target lacking preflight still uses verified control snapshot.'

echo 'PASS: ledger mismatch veto before maintenance and writers; valid ledger passes.'
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
