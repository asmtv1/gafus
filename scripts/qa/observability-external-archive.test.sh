#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
PG="${1:-/opt/homebrew/opt/postgresql@18/bin}"
export PATH="$PG:$PATH"
WORK="$(mktemp -d /tmp/gafus-a2-obs-real-multi.XXXXXXXX)"
cleanup(){
 "$PG/pg_ctl" -D "$WORK/pg" -m immediate stop >/dev/null 2>&1 || true
 rm -rf -- "$WORK"
}
trap cleanup EXIT
unset PGHOST PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS PGPASSWORD PGHOSTADDR
"$PG/initdb" -D "$WORK/pg" -A trust -U gafus_inventory --no-locale --no-instructions >/dev/null
"$PG/pg_ctl" -D "$WORK/pg" -l "$WORK/pg.log" -o "-h '' -k $WORK -p 5432" -w start >/dev/null
PSQL=("$PG/psql" -h "$WORK" -p 5432 -U gafus_inventory -d postgres -XqAt -v ON_ERROR_STOP=1)
# Read only the CREATE TABLE statements from the independent snapshot fixture.
python3 - <<'PY_SQL' | "${PSQL[@]}"
from pathlib import Path
for line in Path("ci-cd/scripts/external-backup/reference-snapshot.test.sh").read_text().splitlines():
    if line.startswith("CREATE TABLE "):print(line)
PY_SQL
node --input-type=module - "$WORK" <<'JS'
import {otaFixture} from "./ci-cd/scripts/external-backup/test-fixtures.mjs";
import {writeFile,mkdir} from "node:fs/promises";
import {createHash,sign} from "node:crypto";
import {join} from "node:path";
import {readFile} from "node:fs/promises";
const dir=process.argv[2], hash=b=>createHash("sha256").update(b).digest("hex");
const origin="https://ota-restore.invalid/source-ota";
const f=await otaFixture(dir,origin,1);
const cert=f.r.certificatePem,key=await readFile(join(dir,"key.pem"));
const media=Buffer.from("isolated media snapshot bytes");
const releases=[1,2].map(revision=>{
 const name=revision===1?"previous.bundle":"active.bundle";
 const bytes=Buffer.from("/* isolated "+name+" */"), sha=hash(bytes);
 const url=origin+"/ota/preview/gafus/1.7.6/ios/assets/"+name;
 const updateId="00000000-0000-4000-8000-00000000002"+revision;
 const body=Buffer.from(JSON.stringify({id:updateId,createdAt:new Date().toISOString(),runtimeVersion:"1.7.6",
  launchAsset:{key:name,hash:Buffer.from(sha,"hex").toString("base64url"),contentType:"application/javascript",url},
  assets:[],metadata:{channel:"preview",environment:"preview",sourceSha:"a".repeat(40)},extra:{ota:{revision}}}));
 return {name,bytes,sha,url,body,updateId,revision,signature:'sig="'+sign("RSA-SHA256",body,key).toString("base64")+'", keyid="qa-key", alg="rsa-v1_5-sha256"'};
});
await mkdir(join(dir,"objects"),{mode:0o700});
for(const r of releases)await writeFile(join(dir,"objects",r.name),r.bytes,{mode:0o600});
await writeFile(join(dir,"objects","media.bin"),media,{mode:0o600});
await writeFile(join(dir,"restore-user-fixture.json"),JSON.stringify({keyId:"qa-key",certificateSha256:hash(cert),mediaSha256:hash(media),
 previousAssetSha256:releases[0].sha,activeAssetSha256:releases[1].sha}),{mode:0o600});
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const n="00000000-0000-4000-8000-000000000001",sha="a".repeat(40),fp="b".repeat(64);
let sql='INSERT INTO "Chat2Media" VALUES ('+[q('a2-restore/media.bin'),q('READY')].join(',')+');\n';
sql+='INSERT INTO "MobileNativeRelease" VALUES ('+[n,cert,hash(cert),fp].map(q).join(",")+",true,'ios','preview','preview','1.7.6','qa-key');\n";
for(const r of releases){
 const id="00000000-0000-4000-8000-00000000001"+r.revision;
 sql+='INSERT INTO "MobileOtaRelease" VALUES ('+[q(id),q(n),q(r.updateId),r.revision,q(sha),q("ios"),q("preview"),q("preview"),q("1.7.6"),q("qa-key"),q("READY"),"decode("+q(r.body.toString("hex"))+",'hex')",q(r.signature)].join(",")+');\n';
 sql+='INSERT INTO "MobileOtaArtifact" VALUES ('+[q(id),q(r.name),q(r.url),q(r.sha),q("application/javascript"),r.bytes.length,true].join(",")+');\n';
}
sql+='INSERT INTO "MobileOtaDeployment" VALUES ('+[q('00000000-0000-4000-8000-000000000012'),q('00000000-0000-4000-8000-000000000011')].join(',')+');\n';
await writeFile(join(dir,"seed.sql"),sql,{mode:0o600});
JS
"${PSQL[@]}" -f "$WORK/seed.sql"
"$PG/pg_dump" -Fc -h "$WORK" -p 5432 -U gafus_inventory -d postgres -f "$WORK/backup.dump"
GAFUS_A2_OBS_ISOLATED=1 node scripts/qa/observability-external-archive.mjs capture "$WORK"
# Simulate loss of the source dump and source bytes. No restore can
# read the original dump or file-backed source objects after this.
mv "$WORK/backup.dump" "$WORK/original-dump-for-comparison"
printf corrupted > "$WORK/objects/media.bin"
GAFUS_A2_OBS_ISOLATED=1 node scripts/qa/observability-external-archive.mjs restore "$WORK"
cmp "$WORK/restored-external.dump" "$WORK/original-dump-for-comparison"
"$PG/createdb" -h "$WORK" -p 5432 -U gafus_inventory recovered
"$PG/pg_restore" --exit-on-error --no-owner --no-privileges -h "$WORK" -p 5432 -U gafus_inventory -d recovered "$WORK/restored-external.dump"
test "$("$PG/psql" -h "$WORK" -p 5432 -U gafus_inventory -d recovered -XqAt -c 'SELECT count(*) FROM "MobileOtaRelease"')" = 2
test "$(cat "$WORK/objects/media.bin")" = 'isolated media snapshot bytes'
echo A2_UNIFIED_ARCHIVE_REAL_PG_RESTORE_PASS
