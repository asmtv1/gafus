// Bridge the existing private service recovery exercise to the real encrypted
// archive CLI. The fixture stores are file-backed fault-injection stores, NOT
// Cloud.ru/Yandex. No production endpoints/credentials are read or contacted.
import {spawnSync} from "node:child_process";
import {randomBytes,createHash} from "node:crypto";
import {readFile,writeFile,mkdir,realpath,copyFile,rename,stat} from "node:fs/promises";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
import {scopes,s3,list,assertPrivateBucket} from "../../ci-cd/scripts/external-backup/archive.mjs";
import {validateRealDrillConfig} from "./observability-external-archive-config.mjs";
const root=fileURLToPath(new URL("../../",import.meta.url));
const tool=join(root,"ci-cd/scripts/external-backup");
const [phase,workArg]=process.argv.slice(2);
assert.equal(process.env.GAFUS_A2_OBS_ISOLATED,"1");
assert.match(workArg??"",/^\/tmp\/gafus-a2-obs-real-multi\.[a-zA-Z0-9]+$/);
assert.ok(["capture","restore"].includes(phase));
const work=await realpath(workArg);
assert.equal((await stat(work)).mode&0o077,0);
const dir=join(work,"external-archive"),s3root=join(dir,"s3");
const hash=b=>createHash("sha256").update(b).digest("hex");
const fixture=JSON.parse(await readFile(join(work,"restore-user-fixture.json"),"utf8"));
const prefix="ota/preview/gafus/1.7.6/ios/assets/";
const objects=[
 {scope:"chat2",key:"a2-restore/media.bin",name:"media.bin",type:"application/octet-stream",sha:fixture.mediaSha256},
 {scope:"ota",key:prefix+"previous.bundle",name:"previous.bundle",type:"application/javascript",sha:fixture.previousAssetSha256},
 {scope:"ota",key:prefix+"active.bundle",name:"active.bundle",type:"application/javascript",sha:fixture.activeAssetSha256}
];
const endpoint="http://127.0.0.1:19191";
let conf={sources:{},targets:{},archive:{endpoint,bucket:"archive-bucket",profile:"archive",region:"us-east-1"},
 otaOrigin:"https://ota-restore.invalid/source-ota",trustedOtaCertificates:{[fixture.keyId]:[fixture.certificateSha256]}};
for(const scope of scopes){
 conf.sources[scope]={endpoint,bucket:"source-"+scope,profile:"source",region:"us-east-1"};
 conf.targets[scope]={endpoint,bucket:"gafus-restore-test-"+scope,profile:"target",region:"us-east-1"};
}
const real=Boolean(process.env.A2_EXTERNAL_DRILL_CONFIG);
const pg=dirname(spawnSync("which",["pg_dump"],{encoding:"utf8"}).stdout.trim());
assert.ok(pg.startsWith("/"));
let awsEnv={};
async function privatePath(path){
 assert.ok(typeof path==="string" && path.startsWith("/"));
 assert.equal(await realpath(path),path);
 const st=await stat(path);assert.ok(st.isFile()&&(st.mode&0o077)===0);
 return path;
}
if(real){
 assert.equal(process.env.A2_EXTERNAL_DRILL_APPROVED,"synthetic-isolated-provider");
 const path=await privatePath(process.env.A2_EXTERNAL_DRILL_CONFIG);
 conf=validateRealDrillConfig(JSON.parse(await readFile(path,"utf8")));
 assert.equal(conf.otaOrigin,fixture.otaOrigin);
 // Trust only the certificate independently created by the synthetic
 // fixture in this run, never a production key or untrusted DB pin.
 conf.trustedOtaCertificates={[fixture.keyId]:[fixture.certificateSha256]};
 awsEnv={AWS_CONFIG_FILE:await privatePath(process.env.A2_EXTERNAL_DRILL_AWS_CONFIG),
  AWS_SHARED_CREDENTIALS_FILE:await privatePath(process.env.A2_EXTERNAL_DRILL_AWS_CREDENTIALS)};
}
const env={PATH:process.env.PATH,HOME:process.env.HOME,
 GAFUS_EXTERNAL_BACKUP_LOCAL_TEST:real?"0":"1",GAFUS_EXTERNAL_BACKUP_SCRATCH:dir,
 GAFUS_EXTERNAL_BACKUP_KEY_FILE:join(dir,"key.bin"),GAFUS_EXTERNAL_BACKUP_PG_BIN:pg,
 ...(real?awsEnv:{GAFUS_AWS_BIN:join(tool,"test-s3-cli.py"),GAFUS_TEST_S3_ROOT:s3root})};
// s3() uses the current process environment. For the real branch replace
// ambient AWS credentials/config with only the dedicated QA files.
if(real){
 for(const k of Object.keys(process.env))if(k.startsWith("AWS_")||k==="GAFUS_AWS_BIN")delete process.env[k];
 Object.assign(process.env,awsEnv);
}
function execute(exe,args) {
 const r=spawnSync(exe,args,{env,encoding:"utf8",timeout:180000});
 assert.equal(r.status,0,r.stderr?.slice(0,500));
 return r.stdout.trim();
}
function run(mode,id,...rest){
 return JSON.parse(execute(process.execPath,[join(tool,"run.mjs"),mode,join(dir,"config.json"),id,mode+"-"+id,...rest]));
}
if(phase==="capture"){
 await mkdir(dir,{mode:0o700});await mkdir(s3root,{mode:0o700});
 await writeFile(join(dir,"key.bin"),randomBytes(32),{mode:0o600,flag:"wx"});
 await writeFile(join(dir,"config.json"),JSON.stringify(conf),{mode:0o600,flag:"wx"});
 if(real){
  // Every bucket is provisioned externally, private, empty, and bound
  // to the exact drill id. Never clean or overwrite an existing bucket.
  for(const c of [...Object.values(conf.sources),...Object.values(conf.targets),conf.archive]){
   assertPrivateBucket(c);assert.equal(list(c).length,0,"QA_EXTERNAL_BUCKET_NOT_EMPTY");
  }
 }else await writeFile(join(s3root,"buckets.json"),JSON.stringify([...Object.values(conf.sources),...Object.values(conf.targets),conf.archive].map(v=>v.bucket)),{mode:0o600});
 for(const entry of objects){
  const bytes=await readFile(join(work,"objects",entry.name));
  assert.equal(hash(bytes),entry.sha);
  if(real){
   const source=conf.sources[entry.scope];
   const c={...source,profile:source.seedProfile};
   s3(c,"put-object",["--bucket",source.bucket,"--key",entry.key,"--body",join(work,"objects",entry.name),"--if-none-match","*","--content-type",entry.type]);
   continue;
  }
  const p=join(s3root,conf.sources[entry.scope].bucket);
  await mkdir(p,{recursive:true,mode:0o700});
  const f=join(p,hash(entry.key));
  await writeFile(f,bytes,{mode:0o600,flag:"wx"});
  await writeFile(f+".json",JSON.stringify({Key:entry.key,Size:bytes.length,
    ETag:'"'+createHash("md5").update(bytes).digest("hex")+'"',
    LastModified:new Date().toISOString(),ContentType:entry.type}),{mode:0o600,flag:"wx"});
 }
 // SQL references are extracted from the actual service dump. The bridge
 // does not hand-author the reference JSON or replace signed asset URLs.
 execute("bash",[join(tool,"export-references.sh"),pg,join(work,"backup.dump"),join(dir,"references.json")]);
 const id=randomBytes(16).toString("hex");
 const result=run("backup",id,join(work,"backup.dump"),join(dir,"references.json"));
 assert.equal(result.status,"ARCHIVE_BYTES_VERIFIED");assert.equal(result.objects,3);
 assert.equal(result.ota.previous,1);assert.equal(result.ota.active,1);
 await writeFile(join(dir,"capture-receipt.json"),JSON.stringify(result),{mode:0o600,flag:"wx"});
 console.log("A2_ENCRYPTED_EXTERNAL_ARCHIVE_CAPTURE_PASS");
}else{
 const captured=JSON.parse(await readFile(join(dir,"capture-receipt.json"),"utf8"));
 const result=run("restore",captured.id,join(dir,"restored.dump"));
 assert.equal(result.status,"ISOLATED_OBJECT_RESTORE_BYTES_VERIFIED");
 assert.equal(result.dbSha256,captured.dbSha256);
 assert.equal(result.objects,3);assert.equal(result.ota.previous,1);assert.equal(result.ota.active,1);
 // Only restored object bytes are delivered by the restarted fixture API.
 // No fallback to original local files/dump is permitted.
 await rename(join(work,"objects"),join(work,"objects-before-crash"));
 await mkdir(join(work,"objects"),{mode:0o700});
 for(const entry of objects){
  const target=conf.targets[entry.scope];
  let bytes;
  if(real){
   const dst=join(work,"objects",entry.name);
   s3(target,"get-object",["--bucket",target.bucket,"--key",entry.key,dst]);
   bytes=await readFile(dst);
   assert.equal(hash(bytes),entry.sha);
   continue;
  }
  bytes=await readFile(join(s3root,target.bucket,hash(entry.key)));
  assert.equal(hash(bytes),entry.sha);
  await writeFile(join(work,"objects",entry.name),bytes,{mode:0o600,flag:"wx"});
 }
 await copyFile(join(dir,"restored.dump"),join(work,"restored-external.dump"),1);
 await writeFile(join(dir,"restore-receipt.json"),JSON.stringify({...result,storageMode:real?"real-isolated-provider":"file-backed-fixture"}),{mode:0o600,flag:"wx"});
 console.log("A2_ENCRYPTED_EXTERNAL_ARCHIVE_RESTORE_PASS");
}
