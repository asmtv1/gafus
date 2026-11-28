import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
const read=p=>readFileSync(new URL("../../../"+p,import.meta.url),"utf8");
test("daily backup remains independent; external capture runs only on approved dedicated runner",()=>{
 const w=read(".github/workflows/daily-backup.yml");
 assert.match(w,/cron: '0 0 \* \* \*'/);
 assert.match(w,/script: bash \/root\/gafus\/ci-cd\/scripts\/backup-to-yandex\.sh/);
 const external=w.slice(w.indexOf("\n  external-backup:"));
 assert.match(external,/vars\.GAFUS_EXTERNAL_BACKUP_ENABLED == 'true'/);
 assert.match(external,/runs-on: \[self-hosted, linux, gafus-backup\]/);
 assert.match(external,/environment: external-backup/);
 assert.match(external,/persist-credentials: false/);
 assert.match(external,/scheduled-capture\.sh/);
 assert.doesNotMatch(external,/secrets\.|needs:|ssh-action/);
});
test("scheduled entrypoint fails closed before accessing configuration or external services",()=>{
 const script="ci-cd/scripts/external-backup/scheduled-capture.sh";
 const result=spawnSync("bash",[script],{env:{PATH:process.env.PATH,HOME:process.env.HOME},encoding:"utf8"});
 assert.equal(result.status,2);assert.match(result.stderr,/SCHEDULED_BACKUP_NOT_APPROVED/);
 const s=read(script);
 assert.match(s,/sslmode=verify-full/);assert.match(s,/default_transaction_read_only=on/);
 assert.match(s,/current_user='gafus_backup'/);assert.match(s,/pg_stat_ssl/);
 assert.match(s,/--format=custom/);assert.match(s,/SCHEDULED_EXTERNAL_CAPTURE_FAILED/);
 assert.match(s,/run\.mjs" verify/);assert.match(s,/SCHEDULED_BACKUP_UNMAPPED_REFERENCES/);
 assert.doesNotMatch(s,/docker exec|ssh |delete-object|rm -rf -- "\$GAFUS/);
});
test("real-service restore consumes encrypted archive output, not original dump or source object copy",()=>{
 const s=read("scripts/qa/observability-real-multi-instance-isolated.sh");
 const capture=s.indexOf('observability-external-archive.mjs capture "$WORK"');
 const restore=s.indexOf('observability-external-archive.mjs restore "$WORK"');
 const recovered=s.indexOf('gafus_a2_observability "$WORK/restored-external.dump"');
 const restart=s.indexOf('launch_a2_api "$port" recovered');
 assert.ok(capture>0 && capture<restore && restore<recovered && recovered<restart);
 assert.doesNotMatch(s,/object-backup/);
 assert.match(s,/A2_EXTERNAL_ARCHIVE_RECEIPT/);
 assert.match(s,/user_ack.*== 1/);
 const bridge=read("scripts/qa/observability-external-archive.mjs");
 assert.match(bridge,/GAFUS_A2_OBS_ISOLATED/);
 assert.match(bridge,/GAFUS_EXTERNAL_BACKUP_LOCAL_TEST:real\?"0":"1"/);
 assert.match(bridge,/export-references\.sh/);
 assert.match(bridge,/ISOLATED_OBJECT_RESTORE_BYTES_VERIFIED/);
 assert.match(bridge,/result\.dbSha256,captured\.dbSha256/);
});
test("real external drill can only use exact synthetic bucket and profile names",async()=>{
 const {validateRealDrillConfig}=await import("../../../scripts/qa/observability-external-archive-config.mjs");
 const {scopes}=await import("./archive.mjs");
 const id="123456789abc", c={drillId:id,sources:{},targets:{},
  archive:{endpoint:"https://archive.invalid",bucket:"gafus-qa-archive-"+id,profile:"qa-archive-"+id,region:"us-east-1"},
  otaOrigin:"https://ota-restore.invalid/gafus-qa-source-"+id+"-ota",trustedOtaCertificates:{}};
 for(const scope of scopes){
  c.sources[scope]={endpoint:"https://source.invalid",bucket:"gafus-qa-source-"+id+"-"+scope,profile:"qa-read-"+id+"-"+scope,seedProfile:"qa-seed-"+id+"-"+scope,region:"us-east-1"};
  c.targets[scope]={endpoint:"https://target.invalid",bucket:"gafus-restore-"+id+"-"+scope,profile:"qa-restore-"+id+"-"+scope,region:"us-east-1"};
 }
 assert.equal(validateRealDrillConfig(c),c);
 const invalid=fn=>{const n=structuredClone(c);fn(n);return n;};
 assert.throws(()=>validateRealDrillConfig(invalid(n=>n.sources.feed.bucket="gafus-feed-private")),/QA_EXTERNAL_BUCKET_OR_PROFILE_NOT_ISOLATED/);
 assert.throws(()=>validateRealDrillConfig(invalid(n=>n.sources.ota.seedProfile="production")),/QA_EXTERNAL_BUCKET_OR_PROFILE_NOT_ISOLATED/);
 assert.throws(()=>validateRealDrillConfig(invalid(n=>n.archive.bucket="production-archive")),/QA_EXTERNAL_ARCHIVE_NOT_ISOLATED/);
 assert.throws(()=>validateRealDrillConfig(invalid(n=>n.otaOrigin="https://production.invalid/"+n.sources.ota.bucket)),/QA_EXTERNAL_OTA_LOCATOR_INVALID/);
});
