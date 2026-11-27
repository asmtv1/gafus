#!/usr/bin/env bash
# Extract reference inventory from the exact supplied custom-format pg_dump.
# Never connects to an existing database. Requires trusted, authenticated dump.
set -euo pipefail
umask 077
# Deterministic locale/time zone; Darwin locale lookup can spawn threads in
# the postmaster when launched from a scrubbed environment.
export LC_ALL=C LANG=C TZ=UTC
[[ $# == 3 ]] || { echo 'usage: export-references.sh PG_BIN DUMP OUTPUT' >&2; exit 2; }
PG="$1"; DUMP="$2"; OUTPUT="$3"
: "${GAFUS_EXTERNAL_BACKUP_SCRATCH:?Private encrypted scratch required}"
[[ -f "$DUMP" && ! -L "$DUMP" && ! -e "$OUTPUT" && ! -L "$OUTPUT" && "$(id -u)" != 0 ]] || exit 2
python3 - "$GAFUS_EXTERNAL_BACKUP_SCRATCH" "$DUMP" "$OUTPUT" <<'CHECK'
import os,pathlib,stat,sys
scratch,dump,out=map(pathlib.Path,sys.argv[1:])
s=scratch.lstat();d=dump.lstat()
if not scratch.is_absolute() or scratch.resolve()!=scratch or not stat.S_ISDIR(s.st_mode) or s.st_mode&0o077:
    raise SystemExit("PRIVATE_SCRATCH_REQUIRED")
if not stat.S_ISREG(d.st_mode) or d.st_mode&0o077:
    raise SystemExit("PRIVATE_DUMP_REQUIRED")
if not out.resolve().is_relative_to(scratch):
    raise SystemExit("REFERENCE_OUTPUT_OUTSIDE_SCRATCH")
CHECK
DIR="$(mktemp -d "$GAFUS_EXTERNAL_BACKUP_SCRATCH/gafus-db-inventory.XXXXXXXX")"
# UNIX socket pathname limits (especially macOS) are shorter than encrypted
# scratch paths. Only the socket lives in this private short directory.
SOCK="$(mktemp -d /tmp/gafus-pg-sock.XXXXXXXX)"
cleanup(){
 "$PG/pg_ctl" -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true
 rm -rf -- "$DIR" "$SOCK"
}
trap cleanup EXIT
# PG* variables must not redirect this connection to another host or user.
unset PGHOST PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS PGPASSWORD PGHOSTADDR
"$PG/initdb" -D "$DIR/pg" -A trust -U gafus_inventory --no-locale --no-instructions >"$DIR/init.log" 2>&1
"$PG/pg_ctl" -D "$DIR/pg" -l "$DIR/pg.log" -o "-h '' -k $SOCK -p 5432 -c shared_buffers=16MB -c max_connections=12" -w start >/dev/null || { echo DB_REFERENCE_PG_START_FAILED >&2; exit 1; }
"$PG/createdb" -h "$SOCK" -p 5432 -U gafus_inventory inventory
dump_sha(){
 python3 - "$DUMP" <<'HASH'
import hashlib,sys
h=hashlib.sha256()
with open(sys.argv[1],"rb") as f:
    for block in iter(lambda:f.read(1024*1024),b""):h.update(block)
print(h.hexdigest())
HASH
}
before="$(dump_sha)"
"$PG/pg_restore" --exit-on-error --no-owner --no-privileges -h "$SOCK" -p 5432 -U gafus_inventory -d inventory "$DUMP" >"$DIR/restore.log" 2>&1 || { echo DB_REFERENCE_RESTORE_FAILED >&2; exit 1; }
"$PG/psql" -h "$SOCK" -p 5432 -U gafus_inventory -d inventory -XqAt -v ON_ERROR_STOP=1 -f "$(dirname "$0")/snapshot-references.sql" >"$DIR/refs.json" 2>"$DIR/query.log" || { echo DB_REFERENCE_EXTRACTION_FAILED >&2; exit 1; }
after="$(dump_sha)"
[[ "$before" == "$after" ]] || { echo DB_DUMP_CHANGED_DURING_INVENTORY >&2; exit 1; }
python3 - "$DIR/refs.json" "$OUTPUT" "$before" <<'PY'
import json,os,sys
with open(sys.argv[1]) as f: data=json.load(f)
data["dumpSha256"]=sys.argv[3]
fd=os.open(sys.argv[2],os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
with os.fdopen(fd,"w") as f:json.dump(data,f,separators=(",",":"))
print("DB_REFERENCE_INVENTORY_EXTRACTED")
PY
