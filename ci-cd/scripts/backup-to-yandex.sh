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
  # Log only a validated Yandex error identifier, never raw response bodies,
  # OAuth credentials, or upload URLs.
  printf '%s' "$response" | python3 -c '
import json,re,sys
try:
    data=json.load(sys.stdin)
except (ValueError,UnicodeError):
    sys.exit(0)
code=data.get("error") if isinstance(data,dict) else None
if isinstance(code,str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]{0,99}",code):
    print("YANDEX_API_ERROR_CODE: " + code, file=sys.stderr)
'
  # The OAuth token might belong to a different account than the browser.
  # Report just the numerical quota if the same token allows reading it.
  if quota_response="$(curl --fail-with-body -sS --retry 1 \
      -H "Authorization: OAuth $YANDEX_DISK_TOKEN" \
      'https://cloud-api.yandex.net/v1/disk' 2>/dev/null)"; then
    printf '%s' "$quota_response" | python3 -c '
import json,sys
try:
    data=json.load(sys.stdin)
except (ValueError,UnicodeError):
    sys.exit(0)
if isinstance(data,dict):
    total,used=data.get("total_space"),data.get("used_space")
    if type(total) is int and type(used) is int and total>=0 and 0<=used<=total:
        print(f"YANDEX_TOKEN_DISK_QUOTA_BYTES: total={total} used={used} free={total-used}",file=sys.stderr)
'
  fi
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
echo 'YANDEX_UPLOAD_URL_GRANTED'
# Capture HTTP status without logging the signed upload URL or arbitrary response.
# 403 from the upload server is different from a 403 from the API endpoint.
put_response="$tmpdir/upload-put-response"
put_status="$(curl -sS --retry 2 -X PUT --upload-file "$file" "$upload_url" \
  --output "$put_response" --write-out '%{http_code}')" || {
  echo 'YANDEX_UPLOAD_PUT_TRANSPORT_FAILED' >&2
  exit 1
}
if [[ ! "$put_status" =~ ^2[0-9][0-9]$ ]]; then
  echo "YANDEX_UPLOAD_PUT_REJECTED_HTTP_$put_status" >&2
  # Parse only a machine-readable error code; never log a response with
  # signed URLs, headers, tokens, or arbitrary uploaded content.
  python3 -c '
import json,re,sys
try:
    with open(sys.argv[1],encoding="utf-8") as f: data=json.load(f)
except (ValueError,UnicodeError,OSError):
    sys.exit(0)
code=data.get("error") if isinstance(data,dict) else None
if isinstance(code,str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]{0,99}",code):
    print("YANDEX_UPLOAD_SERVER_ERROR_CODE: " + code,file=sys.stderr)
' "$put_response"
  exit 1
fi
echo 'YANDEX_UPLOAD_PUT_ACCEPTED'

# Validate that the cloud actually reports the uploaded object with matching size.
verified_via='rest-metadata'
metadata="$(curl --fail-with-body -sS --retry 2 --get \
  -H "Authorization: OAuth $YANDEX_DISK_TOKEN" \
  --data-urlencode "path=$remote" \
  'https://cloud-api.yandex.net/v1/disk/resources')" || {
  printf '%s' "$metadata" | python3 -c '
import json,re,sys
try:
    obj=json.load(sys.stdin)
except (ValueError,UnicodeError):
    sys.exit(0)
code=obj.get("error") if isinstance(obj,dict) else None
if isinstance(code,str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]{0,99}",code):
    print("YANDEX_METADATA_API_ERROR_CODE: " + code,file=sys.stderr)
'
  # During Yandex REST API outages, WebDAV can still read the app folder.
  # Verify by downloading the *actual remote bytes* and comparing to pg_dump.
  # app:/ maps to the application folder visible in Disk as
  # Приложения/Gafus (BD); URL-encode every path component.
  dav_url="$(python3 - "$name" <<'PYCODE'
import sys
from urllib.parse import quote
print('https://webdav.yandex.ru/'+quote('Приложения/Gafus (BD)/'+sys.argv[1],safe='/'))
PYCODE
)"
  readback="$tmpdir/webdav-readback.sql.gz"
  dav_status="$(curl --silent --show-error --retry 2 --max-time 180 \
    --proto '=https' --max-redirs 0 \
    -H "Authorization: OAuth $YANDEX_DISK_TOKEN" \
    --output "$readback" --write-out '%{http_code}' "$dav_url")" || {
    echo 'YANDEX_WEBDAV_READBACK_TRANSPORT_FAILED' >&2
    exit 1
  }
  if [[ "$dav_status" != '200' ]]; then
    echo "YANDEX_WEBDAV_READBACK_HTTP_$dav_status" >&2
    exit 1
  fi
  readback_size="$(wc -c < "$readback" | tr -d ' ')"
  if [[ "$readback_size" != "$local_size" ]] || ! cmp -s -- "$file" "$readback"; then
    echo 'YANDEX_WEBDAV_READBACK_CONTENT_MISMATCH' >&2
    exit 1
  fi
  echo 'YANDEX_WEBDAV_READBACK_VERIFIED: downloaded remote file matches local backup byte-for-byte'
  verified_via='webdav-readback'
}
if [[ "$verified_via" == 'rest-metadata' ]]; then
  printf '%s' "$metadata" | BACKUP_BYTES="$local_size" python3 -c '
import json,sys,os
obj=json.load(sys.stdin)
expected=int(os.environ["BACKUP_BYTES"])
if obj.get("size") != expected or obj.get("type") != "file":
    raise SystemExit("YANDEX_BACKUP_SIZE_MISMATCH")
'
fi
# Optional, fail-closed metrics export. The marker is written only AFTER the
# cloud resource reports the expected size/type OR a full WebDAV byte-compare passes. If unconfigured,
# leave existing production cron behaviour exactly unchanged.
if [[ -n "${GAFUS_BACKUP_METRICS_DIR:-}" ]]; then
  python3 "$(dirname "$0")/emit-verified-backup-metric.py" || {
    echo 'BACKUP_METRICS_WRITE_FAILED_REMOTE_BACKUP_VALID' >&2
    exit 1
  }
fi
echo "BACKUP_VERIFIED_REMOTE: $name ($local_size bytes, via $verified_via)"
echo 'No existing Yandex.Disk backups were deleted or overwritten.'
