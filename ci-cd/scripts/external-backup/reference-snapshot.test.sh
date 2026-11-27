#!/usr/bin/env bash
# PostgreSQL SQL/extraction contract with an exact pg_dump and independent restore.
# Minimal schema fixtures, not a full migration chain.
set -euo pipefail
umask 077
PG="${1:-/opt/homebrew/opt/postgresql@18/bin}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d /tmp/gafus-ext-refs.XXXXXXXX)"
WORK="$(cd "$WORK" && pwd -P)"
cleanup(){
 "$PG/pg_ctl" -D "$WORK/pg" -m immediate stop >/dev/null 2>&1 || true
 rm -rf -- "$WORK"
}
trap cleanup EXIT
unset PGHOST PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS PGPASSWORD PGHOSTADDR
"$PG/initdb" -D "$WORK/pg" -A trust -U gafus_inventory --no-locale --no-instructions >/dev/null
"$PG/pg_ctl" -D "$WORK/pg" -l "$WORK/pg.log" -o "-h '' -k $WORK -p 5432" -w start >/dev/null
PSQL=("$PG/psql" -h "$WORK" -p 5432 -U gafus_inventory -d postgres -XqAt -v ON_ERROR_STOP=1)
"${PSQL[@]}" <<'SQL'
CREATE TABLE "FeedMediaAsset" ("smallKey" text,"thumbKey" text,"fullKey" text,"posterKey" text,"mp4Keys" text[],status text);
CREATE TABLE "GalleryPhoto" ("thumbKey" text,"fullKey" text,"deletedAt" timestamp,status text);
CREATE TABLE "Chat2Media" ("objectKey" text,status text);
CREATE TABLE "PetVetAttachment" ("originalKey" text,"previewKey" text);
CREATE TABLE "PetDocument" (url text);
CREATE TABLE "QuestionPhoto" (url text);
CREATE TABLE "QuestionV2MediaTask" (status text,manifest jsonb);
CREATE TABLE "Chat2V2MediaTask" (status text,manifest jsonb);
CREATE TABLE "TrainerVideo" ("relativePath" text,"hlsManifestPath" text,"thumbnailPath" text);
CREATE TABLE "UserProfile" ("avatarUrl" text);
CREATE TABLE "Pet" ("photoUrl" text);
CREATE TABLE "Course" ("logoImg" text,"videoUrl" text);
CREATE TABLE "Step" ("imageUrls" text[],"pdfUrls" text[],"videoUrls" text[],"videoUrl" text);
CREATE TABLE "StepTemplate" ("imageUrls" text[],"pdfUrls" text[],"videoUrl" text);
CREATE TABLE "Article" ("imageUrls" text[],"logoImg" text,"videoUrl" text);
CREATE TABLE "MobileOtaRelease" (id uuid PRIMARY KEY,"nativeReleaseId" uuid,"updateId" uuid,revision int,"sourceSha" text,platform text,environment text,channel text,"runtimeVersion" text,"signingKeyId" text,state text,"manifestBody" bytea,"signatureHeader" text);
CREATE TABLE "MobileNativeRelease" (id uuid PRIMARY KEY,"certificatePem" text,"certificateSha256" text,"nativeFingerprint" text,verified bool,platform text,environment text,channel text,"runtimeVersion" text,"signingKeyId" text);
CREATE TABLE "MobileOtaDeployment" ("activeReleaseId" uuid,"previousReleaseId" uuid);
CREATE TABLE "MobileOtaPublication" ("releaseIds" uuid[]);
CREATE TABLE "MobileOtaArtifact" ("releaseId" uuid,"assetKey" text,"immutableUrl" text,sha256 text,"mimeType" text,"sizeBytes" bigint,verified bool);
INSERT INTO "FeedMediaAsset" VALUES ('feed/small',NULL,'feed/full','feed/poster',ARRAY['feed/360','feed/720'],'ready'),('excluded',NULL,NULL,NULL,ARRAY[]::text[],'reserved');
INSERT INTO "GalleryPhoto" VALUES ('gallery/thumb','gallery/full',NULL,'ready'),('excluded','excluded',now(),'ready');
INSERT INTO "Chat2Media" VALUES ('chat2/original','READY'),('excluded','PENDING');
INSERT INTO "PetVetAttachment" VALUES ('vet/original','vet/thumb');
INSERT INTO "PetDocument" VALUES ('cloudru:documents:documents/private'),('https://storage.yandexcloud.net/gafus-media/uploads/document'),('unmapped-document');
INSERT INTO "QuestionPhoto" VALUES ('cloudru:questions:questions/private'),('questions-v2:question/medium');
INSERT INTO "QuestionV2MediaTask" VALUES ('READY','{"variants":{"small":{"key":"question/small"},"medium":{"key":"question/medium"}}}');
INSERT INTO "Chat2V2MediaTask" VALUES ('READY','{"kind":"video","posterKey":"chat2/poster","renditions":[{"key":"chat2/360"},{"key":"chat2/720"}]}');
INSERT INTO "TrainerVideo" VALUES ('trainers/source.mp4','/uploads/trainers/video.m3u8','uploads/trainers/thumb.webp');
INSERT INTO "UserProfile" VALUES ('https://cdn.gafus.ru/uploads/avatar');
INSERT INTO "Pet" VALUES ('https://gafus-media.storage.yandexcloud.net/uploads/pet');
INSERT INTO "Course" VALUES ('uploads/course','https://external.example/video');
INSERT INTO "Step" VALUES (ARRAY['https://gafus.ru/uploads/step'],ARRAY['/uploads/pdf'],ARRAY['https://www.gafus.ru/uploads/video'],NULL);
INSERT INTO "StepTemplate" VALUES (ARRAY['uploads/template'],ARRAY[]::text[],NULL);
INSERT INTO "Article" VALUES (ARRAY['uploads/article'],NULL,NULL);
INSERT INTO "MobileNativeRelease" VALUES ('00000000-0000-4000-8000-000000000001','test certificate','test hash','test fingerprint',true,'ios','preview','preview','1.7.6','test-key');
INSERT INTO "MobileOtaRelease" VALUES
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000021',1,'sha','ios','preview','preview','1.7.6','test-key','READY',decode('010203','hex'),'signature'),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000022',2,'sha','ios','preview','preview','1.7.6','test-key','READY',decode('040506','hex'),'signature');
INSERT INTO "MobileOtaDeployment" VALUES ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011');
INSERT INTO "MobileOtaArtifact" VALUES ('00000000-0000-4000-8000-000000000011','bundle','https://example.test/bundle','sha','application/javascript',123,true);
SQL
"$PG/pg_dump" -Fc -h "$WORK" -p 5432 -U gafus_inventory -d postgres -f "$WORK/source.dump"
# The post-dump source mutation must never appear in the extracted inventory.
"${PSQL[@]}" -c "UPDATE \"PetDocument\" SET url='post-dump-mutated'"
export GAFUS_EXTERNAL_BACKUP_SCRATCH="$WORK"
bash "$HERE/export-references.sh" "$PG" "$WORK/source.dump" "$WORK/references.json"
python3 - "$WORK" <<'PY'
import hashlib,json,pathlib,sys
p=pathlib.Path(sys.argv[1])
d=json.loads((p/"references.json").read_text())
assert d["dumpSha256"]==hashlib.sha256((p/"source.dump").read_bytes()).hexdigest()
refs={(v["scope"],v["key"]) for v in d["media"]}
expected={
("feed","feed/small"),("feed","feed/full"),("feed","feed/poster"),("feed","feed/360"),("feed","feed/720"),
("gallery","gallery/thumb"),("gallery","gallery/full"),("gallery","vet/original"),("gallery","vet/thumb"),
("chat2","chat2/original"),("chat2","chat2/poster"),("chat2","chat2/360"),("chat2","chat2/720"),
("documents","documents/private"),("questions","questions/private"),
("questions-v2","question/small"),("questions-v2","question/medium"),
*(("public","uploads/"+k) for k in ["document","avatar","pet","course","step","pdf","video","template","article","trainers/source.mp4","trainers/video.m3u8","trainers/thumb.webp"])
}
assert refs==expected,(refs-expected,expected-refs)
assert d["unmapped"]["petDocuments"]==1
assert d["unmapped"]["chat2V2ReadyMissingManifest"]==0
assert len(d["ota"])==2 and d["ota"][0]["previous"] and d["ota"][1]["active"]
assert d["ota"][0]["manifestHex"]=="010203" and d["ota"][0]["artifacts"][0]["sizeBytes"]=="123"
print("REAL_PG_DUMP_RESTORE_REFERENCE_PARITY_PASS",len(refs),"mapped objects, active+previous release")
PY
