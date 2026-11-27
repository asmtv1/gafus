#!/usr/bin/env bash
# Dedicated non-root backup runner only. Independent read-only DB service
# and S3 profiles are installed out of band, never on an ordinary CI runner.
set -euo pipefail
umask 077
[[ "${GAFUS_EXTERNAL_BACKUP_CAPTURE_APPROVED:-}" == encrypted-independent-archive && "$(id -u)" != 0 ]] || { echo SCHEDULED_BACKUP_NOT_APPROVED >&2; exit 2; }
: "${GAFUS_EXTERNAL_BACKUP_CONFIG:?}"
: "${GAFUS_EXTERNAL_BACKUP_KEY_FILE:?}"
: "${GAFUS_EXTERNAL_BACKUP_SCRATCH:?}"
: "${GAFUS_EXTERNAL_BACKUP_PG_BIN:?}"
: "${GAFUS_EXTERNAL_BACKUP_PG_SERVICE_FILE:?}"
: "${GAFUS_EXTERNAL_BACKUP_PG_PASS_FILE:?}"
[[ "${GAFUS_EXTERNAL_BACKUP_LOCAL_TEST:-}" != 1 && -z "${GAFUS_AWS_BIN:-}" ]] || { echo SCHEDULED_BACKUP_TEST_OVERRIDE_FORBIDDEN; exit 2; }
HERE="$(cd "$(dirname "$0")" && pwd)"
python3 - "$GAFUS_EXTERNAL_BACKUP_SCRATCH" "$GAFUS_EXTERNAL_BACKUP_CONFIG" "$GAFUS_EXTERNAL_BACKUP_KEY_FILE" "$GAFUS_EXTERNAL_BACKUP_PG_SERVICE_FILE" "$GAFUS_EXTERNAL_BACKUP_PG_PASS_FILE" <<'PY'
import pathlib,stat,sys
for i,name in enumerate(sys.argv[1:]):
    p=pathlib.Path(name);s=p.lstat()
    if not p.is_absolute() or p.resolve()!=p or s.st_mode&0o077 or not (stat.S_ISDIR(s.st_mode) if i==0 else stat.S_ISREG(s.st_mode)):
        raise SystemExit("SCHEDULED_BACKUP_PRIVATE_PATH_REQUIRED")
PY
PG="$GAFUS_EXTERNAL_BACKUP_PG_BIN"
[[ "$PG" == /* && -x "$PG/pg_dump" && -x "$PG/psql" ]] || { echo SCHEDULED_BACKUP_PG_BIN_REQUIRED >&2; exit 2; }
WORK="$(mktemp -d "$GAFUS_EXTERNAL_BACKUP_SCRATCH/gafus-scheduled-capture.XXXXXXXX")"
trap 'rm -rf -- "$WORK"' EXIT
# Explicit connection only: cannot accidentally fall back to a local DB or
# inherited production application credentials. Service must enforce TLS
# verification and be scoped to a dedicated read-only backup role.
db_env=(env -i PATH="$PATH" HOME="$HOME" PGSERVICEFILE="$GAFUS_EXTERNAL_BACKUP_PG_SERVICE_FILE" PGPASSFILE="$GAFUS_EXTERNAL_BACKUP_PG_PASS_FILE" PGSERVICE=gafus_backup PGSSLMODE=verify-full PGOPTIONS="-c default_transaction_read_only=on -c lock_timeout=5000" PGCONNECT_TIMEOUT=15)
CONN="service=gafus_backup sslmode=verify-full connect_timeout=15 options='-c default_transaction_read_only=on -c lock_timeout=5000'"
# No raw DB output or connection string in Actions logs.
check="$("${db_env[@]}" "$PG/psql" --dbname="$CONN" -XqAt --no-password --set=ON_ERROR_STOP=1 -c "SELECT current_database()='gafus' AND current_user='gafus_backup' AND current_setting('transaction_read_only')='on' AND EXISTS (SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl)" 2>"$WORK/db-preflight.log")" || { echo SCHEDULED_BACKUP_DB_PREFLIGHT_FAILED >&2; exit 1; }
[[ "$check" == t ]] || { echo SCHEDULED_BACKUP_DB_IDENTITY_OR_TLS_MISMATCH >&2; exit 1; }
"${db_env[@]}" "$PG/pg_dump" --dbname="$CONN" --format=custom --no-password --lock-wait-timeout=5000 --file="$WORK/database.dump" 2>"$WORK/pg-dump.log" || { echo SCHEDULED_BACKUP_PG_DUMP_FAILED >&2; exit 1; }
test -s "$WORK/database.dump"
# Capture prints one safe JSON receipt as the final line. Verify the
# committed archive independently (including a fresh PostgreSQL restore).
bash "$HERE/capture-production.sh" "$WORK/database.dump" >"$WORK/capture.log" || { echo SCHEDULED_EXTERNAL_CAPTURE_FAILED >&2; exit 1; }
id="$(python3 - "$WORK/capture.log" <<'PY_RECEIPT'
import json,re,sys
d=json.loads(open(sys.argv[1]).read().splitlines()[-1])
assert d["status"]=="ARCHIVE_BYTES_VERIFIED" and re.fullmatch(r"[a-f0-9]{32}",d["id"])
print(d["id"])
PY_RECEIPT
)"
node "$HERE/run.mjs" verify "$GAFUS_EXTERNAL_BACKUP_CONFIG" "$id" "verify-$id" >"$WORK/verify.log" || { echo SCHEDULED_EXTERNAL_VERIFY_FAILED >&2; exit 1; }
python3 - "$WORK/capture.log" "$WORK/verify.log" <<'PY_VERIFY'
import json,sys
c,v=[json.loads(open(p).read().splitlines()[-1]) for p in sys.argv[1:]]
assert v["status"]=="ARCHIVE_VERIFIED_NO_RESTORE" and c["id"]==v["id"]
assert c["objects"]==v["objects"] and c["ota"]==v["ota"] and c["unmapped"]==v["unmapped"]
print(json.dumps({"status":"SCHEDULED_EXTERNAL_ARCHIVE_VERIFIED","id":c["id"],"dbSha256":c["dbSha256"],"objects":c["objects"],"ota":c["ota"],"unmapped":c["unmapped"]}))
if any(c["unmapped"].values()):
    raise SystemExit("SCHEDULED_BACKUP_UNMAPPED_REFERENCES")
PY_VERIFY
