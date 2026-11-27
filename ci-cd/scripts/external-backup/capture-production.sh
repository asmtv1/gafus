#!/usr/bin/env bash
# Explicit non-root backup runner entrypoint. Input is a trusted, read-only\n# custom-format pg_dump obtained by an approved DBA job. Archive writes use\n# a separate private account; no live DB credentials are required here.
set -euo pipefail
umask 077
[[ "${GAFUS_EXTERNAL_BACKUP_CAPTURE_APPROVED:-}" == 'encrypted-independent-archive' ]] || { echo EXTERNAL_CAPTURE_NOT_APPROVED; exit 2; }
: "${GAFUS_EXTERNAL_BACKUP_CONFIG:?}"
: "${GAFUS_EXTERNAL_BACKUP_KEY_FILE:?}"
: "${GAFUS_EXTERNAL_BACKUP_SCRATCH:?}"
: "${GAFUS_EXTERNAL_BACKUP_PG_BIN:?}"
[[ "${GAFUS_EXTERNAL_BACKUP_LOCAL_TEST:-}" != 1 ]] || exit 2
HERE="$(cd "$(dirname "$0")" && pwd)"
[[ $# == 1 && -f "$1" && ! -L "$1" && "$(id -u)" != 0 ]] || { echo TRUSTED_DUMP_AND_NONROOT_RUNNER_REQUIRED >&2; exit 2; }
DUMP="$1"
python3 - "$GAFUS_EXTERNAL_BACKUP_SCRATCH" <<'CHECK'
import pathlib,stat,sys
p=pathlib.Path(sys.argv[1]);s=p.lstat()
if not p.is_absolute() or p.resolve()!=p or not stat.S_ISDIR(s.st_mode) or s.st_mode&0o077:
    raise SystemExit("PRIVATE_SCRATCH_REQUIRED")
CHECK
WORK="$(mktemp -d "$GAFUS_EXTERNAL_BACKUP_SCRATCH/gafus-external-capture.XXXXXXXX")"
trap 'rm -rf -- "$WORK"' EXIT
# Exact compressed dump + independently extracted inventory, not a second
# live query with a different snapshot.
test -s "$DUMP"
bash "$HERE/export-references.sh" "$GAFUS_EXTERNAL_BACKUP_PG_BIN" "$DUMP" "$WORK/references.json"
id="$(node -e 'process.stdout.write(require("crypto").randomBytes(16).toString("hex"))')"
node "$HERE/run.mjs" backup "$GAFUS_EXTERNAL_BACKUP_CONFIG" "$id" "backup-$id" "$DUMP" "$WORK/references.json"
