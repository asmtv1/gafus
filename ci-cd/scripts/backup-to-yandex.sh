#!/usr/bin/env bash
# Production PostgreSQL backup -> Yandex.Disk. Append-only; never deletes or overwrites remote files.
set -euo pipefail
umask 077

: "${YANDEX_DISK_TOKEN:?YANDEX_DISK_TOKEN is required}"
command -v docker >/dev/null
command -v python3 >/dev/null
command -v curl >/dev/null
command -v gzip >/dev/null

tmpdir="$(mktemp -d /tmp/gafus-yandex-backup.XXXXXXXX)"
trap 'rm -rf -- "$tmpdir"' EXIT
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="gafus_backup_${stamp}_${RANDOM}.sql.gz"
file="$tmpdir/$name"
remote="app:/$name"

echo "Creating streaming PostgreSQL backup: $name"
# pipefail makes failures in pg_dump fatal even if gzip exits successfully.
docker exec gafus-postgres pg_dump -U gafus -d gafus | gzip -c > "$file"
local_size="$(wc -c < "$file" | tr -d ' ')"
test "$local_size" -gt 1024 || { echo 'BACKUP_UNEXPECTEDLY_SMALL'; exit 1; }
gzip -t "$file"

# Never use overwrite=true; a second attempt must not replace a previous backup.
response="$(curl --fail-with-body -sS --retry 2 --get \
  -H "Authorization: OAuth $YANDEX_DISK_TOKEN" \
  --data-urlencode "path=$remote" --data-urlencode "overwrite=false" \
  'https://cloud-api.yandex.net/v1/disk/resources/upload')" || {
  echo 'YANDEX_UPLOAD_URL_REJECTED: check storage quota and API permissions, no deletion attempted'
  exit 1
}
upload_url="$(printf '%s' "$response" | python3 -c '
import json,sys
from urllib.parse import urlparse
u=json.load(sys.stdin).get("href","")
p=urlparse(u)
if p.scheme != "https" or not p.hostname or p.username or p.password:
    raise SystemExit("YANDEX_UPLOAD_URL_INVALID")
host=p.hostname.lower()
if not (host.endswith(".yandex.net") or host.endswith(".yandex.ru")
        or host in ("yandex.net","yandex.ru")):
    raise SystemExit("YANDEX_UPLOAD_HOST_NOT_ALLOWED")
print(u)
')"
curl --fail-with-body -sS --retry 2 -X PUT --upload-file "$file" "$upload_url" -o /dev/null

# Validate that the cloud actually reports the uploaded object with matching size.
metadata="$(curl --fail-with-body -sS --retry 2 --get \
  -H "Authorization: OAuth $YANDEX_DISK_TOKEN" \
  --data-urlencode "path=$remote" \
  'https://cloud-api.yandex.net/v1/disk/resources')"
printf '%s' "$metadata" | BACKUP_BYTES="$local_size" python3 -c '
import json,sys,os
obj=json.load(sys.stdin)
expected=int(os.environ["BACKUP_BYTES"])
if obj.get("size") != expected or obj.get("type") != "file":
    raise SystemExit("YANDEX_BACKUP_SIZE_MISMATCH")
'
# Optional, fail-closed metrics export. The marker is written only AFTER the
# cloud resource reports the expected file size and type. If unconfigured,
# leave existing production cron behaviour exactly unchanged.
if [[ -n "${GAFUS_BACKUP_METRICS_DIR:-}" ]]; then
  python3 "$(dirname "$0")/emit-verified-backup-metric.py" || {
    echo 'BACKUP_METRICS_WRITE_FAILED_REMOTE_BACKUP_VALID' >&2
    exit 1
  }
fi
echo "BACKUP_VERIFIED_REMOTE: $name ($local_size bytes)"
echo 'No existing Yandex.Disk backups were deleted or overwritten.'
