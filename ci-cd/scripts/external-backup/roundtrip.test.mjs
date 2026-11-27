import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, mkdir, writeFile, readFile, readdir, rm, chmod } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { scopes } from "./archive.mjs";
import { otaFixture } from "./test-fixtures.mjs";
const hash=b=>createHash("sha256").update(b).digest("hex");
const etag=b=>'"'+createHash("md5").update(b).digest("hex")+'"';
test("full archive orchestration: pagination, signed current+previous, corruption before restore, private empty targets, exact readback",async()=>{
 const dir=await realpath(await mkdtemp(join(tmpdir(),"gafus-ext-qa-")));
 try {
  await chmod(dir,0o700);
  const endpoint="http://127.0.0.1:19191",s3root=join(dir,"s3");await mkdir(s3root);
  const conf={sources:{},targets:{},archive:{endpoint,bucket:"archive-bucket",profile:"archive",region:"us-east-1"},
   otaOrigin:"https://example.test/source-ota",trustedOtaCertificates:{}};
  const c=(bucket,profile)=>({endpoint,bucket,profile,region:"us-east-1"});
  for(const scope of scopes){conf.sources[scope]=c("source-"+scope,"source");conf.targets[scope]=c("gafus-restore-test-"+scope,"target");}
  await writeFile(join(s3root,"buckets.json"),JSON.stringify([...Object.values(conf.sources),...Object.values(conf.targets),conf.archive].map(v=>v.bucket)));
  const seeded=[];
  async function seed(scope,key,bytes,headers={ContentType:"application/octet-stream"}) {
   const p=join(s3root,conf.sources[scope].bucket);await mkdir(p,{recursive:true});
   const f=join(p,hash(key));await writeFile(f,bytes);
   await writeFile(f+".json",JSON.stringify({Key:key,Size:bytes.length,ETag:etag(bytes),LastModified:"2026-11-27T12:00:00Z",...headers}));
   seeded.push({scope,key,bytes,headers});
  }
  for(const [key,bytes] of [["post/image.webp",Buffer.from("synthetic private webp")],["post/poster.webp",Buffer.from("synthetic poster")],["post/empty",Buffer.alloc(0)]])
    await seed("feed",key,bytes,{ContentType:"image/webp",CacheControl:"private, max-age=180",Metadata:{origin:"qa"}});
  const releases=[];
  for(const revision of [1,2]){
   const f=await otaFixture(dir,conf.otaOrigin,revision);releases.push(f.r);
   conf.trustedOtaCertificates["qa-key"]=[...(conf.trustedOtaCertificates["qa-key"]??[]),...f.trust["qa-key"]];
   await seed("ota",f.key,f.bytes,{ContentType:"application/javascript"});
  }
  const config=join(dir,"config.json"),dump=join(dir,"database.dump"),refs=join(dir,"refs.json"),keyfile=join(dir,"key.bin");
  const dbBytes=randomBytes(8192);
  await writeFile(config,JSON.stringify(conf),{mode:0o600});await writeFile(dump,dbBytes,{mode:0o600});await writeFile(keyfile,randomBytes(32),{mode:0o600});
  await writeFile(refs,JSON.stringify({dumpSha256:hash(dbBytes),media:seeded.filter(v=>v.scope==="feed").map(({scope,key})=>({scope,key})),ota:releases,unmapped:{unresolved:0}}),{mode:0o600});
  const id=randomBytes(16).toString("hex"),out=join(dir,"restored.dump");
  const run=(mode,...rest)=>spawnSync(process.execPath,[fileURLToPath(new URL("run.mjs",import.meta.url)),mode,config,id,mode+"-"+id,...rest],{
   encoding:"utf8",timeout:120000,env:{...process.env,GAFUS_EXTERNAL_BACKUP_LOCAL_TEST:"1",GAFUS_EXTERNAL_BACKUP_SCRATCH:dir,GAFUS_EXTERNAL_BACKUP_KEY_FILE:keyfile,
   GAFUS_AWS_BIN:fileURLToPath(new URL("test-s3-cli.py",import.meta.url)),GAFUS_TEST_S3_ROOT:s3root}});
  function ok(result){assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);}
  const receipt=ok(run("backup",dump,refs));
  assert.equal(receipt.objects,seeded.length);assert.equal(receipt.ota.previous,1);assert.equal(receipt.ota.active,1);
  // Archive ciphertext contains no plaintext media or dump.
  const archive=join(s3root,"archive-bucket");
  for(const name of (await readdir(archive)).filter(n=>!n.endsWith(".json"))){
   const bytes=await readFile(join(archive,name));assert.ok(!bytes.includes(seeded[0].bytes));assert.ok(!bytes.includes(dbBytes));
  }
  const duplicate=run("backup",dump,refs);assert.notEqual(duplicate.status,0);assert.match(duplicate.stderr,/ARCHIVE_ID_ALREADY_EXISTS/);
  const key=seeded[0].key, objectKey="gafus-external-v1/"+id+"/objects/"+hash("feed\0"+key);
  const path=join(archive,hash(objectKey)),original=await readFile(path),bad=Buffer.from(original);bad[bad.length-1]^=1;
  await writeFile(path,bad);
  const rejected=run("restore",out);assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/ARCHIVE_CIPHER_HASH_MISMATCH/);
  assert.ok(!(await readdir(s3root)).some(n=>n.startsWith("gafus-restore-")));
  await writeFile(path,original);
  assert.equal(ok(run("verify")).status,"ARCHIVE_VERIFIED_NO_RESTORE");
  await writeFile(join(s3root,"public-bucket"),conf.targets.feed.bucket);
  const publicRejected=run("restore",out);assert.notEqual(publicRejected.status,0);assert.match(publicRejected.stderr,/BUCKET_POLICY_NOT_PRIVATE/);
  await rm(join(s3root,"public-bucket"));
  const restored=ok(run("restore",out));assert.equal(restored.objects,seeded.length);
  assert.deepEqual(await readFile(out),dbBytes);
  for(const entry of seeded){
   const f=join(s3root,conf.targets[entry.scope].bucket,hash(entry.key));
   assert.deepEqual(await readFile(f),entry.bytes);
   const headers=JSON.parse(await readFile(f+".json","utf8"));
   for(const [k,v] of Object.entries(entry.headers))assert.deepEqual(headers[k],v);
  }
  const repeat=run("restore",join(dir,"other.dump"));assert.notEqual(repeat.status,0);assert.match(repeat.stderr,/RESTORE_TARGET_NOT_EMPTY/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
