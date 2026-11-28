#!/usr/bin/env node
import { randomBytes, createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, stat, lstat, realpath, rm, chmod, copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyDeliveryProbes } from "./delivery-probes.mjs";
import { digest, seal, unseal, list, s3, metadata, validateConfig, verifyOta, must, validObjectKey, assertPrivateBucket } from "./archive.mjs";

const HEX=/^[a-f0-9]{64}$/, ID=/^[a-f0-9]{32}$/;
const MAX=4*1024**3;
const json=x=>JSON.stringify(x);
const hash=x=>createHash("sha256").update(x).digest("hex");
const same=(a,b)=>json(a)===json(b);
const objectId=(scope,key)=>hash(scope+"\0"+key);
const archiveName=(id,kind)=>"gafus-external-v1/"+id+"/"+kind;
async function privateFile(path) {
  const st=await lstat(path);
  must(st.isFile() && (st.mode&0o077)===0,"PRIVATE_FILE_REQUIRED");
}
function readRefs(value, dbSha) {
  must(value?.dumpSha256===dbSha && Array.isArray(value.media) && Array.isArray(value.ota) &&
    value.unmapped && Object.values(value.unmapped).every(v=>Number.isSafeInteger(v)&&v>=0),
    "DB_REFERENCE_SNAPSHOT_MISMATCH");
  return value;
}
function checkReferences(refs, entries, config) {
  const byKey=new Map(entries.map(e=>[e.scope+"\0"+e.key,e]));
  must(byKey.size===entries.length,"DUPLICATE_BACKUP_OBJECT");
  for(const r of refs.media) {
    must(validObjectKey(r.key) && Object.hasOwn(config.sources,r.scope) && byKey.has(r.scope+"\0"+r.key),
      "DB_REFERENCED_OBJECT_MISSING");
  }
  return verifyOta(refs.ota, config.otaOrigin, byKey, config.trustedOtaCertificates);
}
function get(c,key,path,ifMatch) {
  return s3(c,"get-object",["--bucket",c.bucket,"--key",key,...(ifMatch?["--if-match",ifMatch]:[]),path]);
}
function put(c,key,path,headers={}) {
  return s3(c,"put-object",["--bucket",c.bucket,"--key",key,"--body",path,"--if-none-match","*",
    ...Object.entries(headers).flatMap(([k,v])=>{
      const names={ContentType:"content-type",CacheControl:"cache-control",ContentDisposition:"content-disposition",
        ContentEncoding:"content-encoding",ContentLanguage:"content-language",Expires:"expires",Metadata:"metadata"};
      must(Object.hasOwn(names,k),"UNSUPPORTED_BACKUP_METADATA");
      return ["--"+names[k],typeof v==="string"?v:json(v)];
    })]);
}
async function storeFile(ctx,name,src) {
  const {config,id,key,work}=ctx;
  const cipher=join(work,"cipher"), readback=join(work,"readback");
  try {
    must((await stat(src)).size<=MAX,"ARCHIVE_OBJECT_TOO_LARGE");
    await seal(src,cipher,key,id+"/"+name);
    const sha256=await digest(cipher), remote=archiveName(id,name);
    put(config.archive,remote,cipher,{ContentType:"application/octet-stream"});
    get(config.archive,remote,readback);
    must(await digest(readback)===sha256,"ARCHIVE_READBACK_MISMATCH");
    return sha256;
  } finally { await Promise.all([rm(cipher,{force:true}),rm(readback,{force:true})]); }
}
async function retrieveFile(ctx,name,dst,expectedHash) {
  const file=join(ctx.work,"cipher");
  try {
    get(ctx.config.archive,archiveName(ctx.id,name),file);
    if(expectedHash) must(await digest(file)===expectedHash,"ARCHIVE_CIPHER_HASH_MISMATCH");
    await unseal(file,dst,ctx.key,ctx.id+"/"+name);
  } finally {await rm(file,{force:true});}
}
async function backup(ctx,dump,refsFile) {
  const {config,id,work}=ctx;
  await privateFile(dump);await privateFile(refsFile);
  const startedAt=new Date().toISOString(), dbSha=await digest(dump);
  const refsHash=await digest(refsFile);
  const refs=readRefs(JSON.parse(await readFile(refsFile,"utf8")),dbSha);
  must(await digest(refsFile)===refsHash,"REFERENCES_CHANGED_DURING_CAPTURE");
  assertPrivateBucket(config.archive,ctx.local);
  must(list(config.archive,archiveName(id,"")).length===0,"ARCHIVE_ID_ALREADY_EXISTS");
  const records=[], inventories={};
  const tmp=join(work,"plain");
  // Capture inventories before reading any source bytes; list again before
  // publishing a commit manifest. This detects observed churn, not a globally
  // atomic bucket/DB snapshot. Operator must quiesce GC during capture.
  for(const [scope,source] of Object.entries(config.sources)) inventories[scope]=list(source);
  for(const [scope,source] of Object.entries(config.sources)) {
    for(const item of inventories[scope]) {
      try {
        const h=get(source,item.key,tmp,item.etag);
        must(h.ETag===item.etag && (await stat(tmp)).size===item.size,"SOURCE_CHANGED_DURING_CAPTURE");
        const sha256=await digest(tmp), name="objects/"+objectId(scope,item.key);
        records.push({scope,key:item.key,size:item.size,sha256,
          meta:metadata(h),cipherSha256:await storeFile(ctx,name,tmp)});
      } finally { await rm(tmp,{force:true}); }
    }
  }
  for(const [scope,source] of Object.entries(config.sources))
    must(same(inventories[scope],list(source)),"SOURCE_INVENTORY_CHANGED_DURING_CAPTURE");
  const ota=checkReferences(refs,records,config);
  const db={sha256:dbSha,size:(await stat(dump)).size,cipherSha256:await storeFile(ctx,"database",dump)};
  must(await digest(dump)===dbSha,"DB_DUMP_CHANGED_DURING_CAPTURE");
  // Include the exact referenced snapshot inventory; no raw paths are logged.
  must(await digest(refsFile)===refsHash,"REFERENCES_CHANGED_DURING_CAPTURE");
  const refsCipher=await storeFile(ctx,"references",refsFile);
  must(await digest(refsFile)===refsHash,"REFERENCES_CHANGED_DURING_CAPTURE");
  const manifest={version:1,id,startedAt,finishedAt:new Date().toISOString(),
    sources:Object.fromEntries(Object.entries(config.sources).map(([s,v])=>[s,{endpoint:v.endpoint,bucket:v.bucket}])),
    otaOrigin:config.otaOrigin,db,refs:{sha256:refsHash,cipherSha256:refsCipher},records,ota,unmapped:refs.unmapped};
  const manifestPath=join(work,"manifest");
  await writeFile(manifestPath,json(manifest),{flag:"wx",mode:0o600});
  // Commit marker last. Incomplete prefixes remain unpublished, never treated
  // as recoverable. No automatic deletion of old snapshots or partial uploads.
  await storeFile(ctx,"manifest",manifestPath);
  console.log(json({status:"ARCHIVE_BYTES_VERIFIED",id,objects:records.length,ota,unmapped:refs.unmapped,
    dbSha256:dbSha,consistency:"observed inventory stable; cross-system atomicity not asserted"}));
}
function validateManifest(ctx,m) {
  must(m?.version===1 && m.id===ctx.id && Array.isArray(m.records) &&
    m.otaOrigin===ctx.config.otaOrigin &&
    same(m.sources,Object.fromEntries(Object.entries(ctx.config.sources).map(([s,v])=>[s,{endpoint:v.endpoint,bucket:v.bucket}]))),
    "ARCHIVE_CONFIG_MISMATCH");
  must(HEX.test(m.db?.sha256) && HEX.test(m.db?.cipherSha256) && HEX.test(m.refs?.sha256) && HEX.test(m.refs?.cipherSha256),"BAD_ARCHIVE_MANIFEST");
  const seen=new Set();
  for(const e of m.records) {
    const key=e.scope+"\0"+e.key;
    must(Object.hasOwn(ctx.config.targets,e.scope) && validObjectKey(e.key) &&
      !seen.has(key) && Number.isSafeInteger(e.size) && e.size>=0 && e.size<=MAX &&
      HEX.test(e.sha256) && HEX.test(e.cipherSha256) && e.meta && same(e.meta,metadata(e.meta)),
      "BAD_ARCHIVE_RECORD");
    seen.add(key);
  }
  return m;
}
async function restore(ctx,output,verifyOnly,probeFile) {
  const started=performance.now();
  const {config,id,work}=ctx;
  assertPrivateBucket(config.archive,ctx.local);
  const manifestPath=join(work,"manifest");
  await retrieveFile(ctx,"manifest",manifestPath);
  const m=validateManifest(ctx,JSON.parse(await readFile(manifestPath,"utf8")));
  const dump=join(work,"database"),refsPath=join(work,"references"),tmp=join(work,"plain"),readback=join(work,"readback");
  await retrieveFile(ctx,"database",dump,m.db.cipherSha256);
  must(await digest(dump)===m.db.sha256 && (await stat(dump)).size===m.db.size,"RESTORED_DB_HASH_MISMATCH");
  await retrieveFile(ctx,"references",refsPath,m.refs.cipherSha256);
  must(await digest(refsPath)===m.refs.sha256,"RESTORED_REFERENCES_HASH_MISMATCH");
  const refs=readRefs(JSON.parse(await readFile(refsPath,"utf8")),m.db.sha256);
  const ota=checkReferences(refs,m.records,config);
  // In real mode load the exact recovered dump into a fresh socket-only
  // database and compare its extracted references before destination writes.
  if(!ctx.local) {
    const pg=process.env.GAFUS_EXTERNAL_BACKUP_PG_BIN;
    must(typeof pg==="string" && pg.startsWith("/"),"RESTORE_POSTGRES_BIN_REQUIRED");
    const extracted=join(work,"restored-references");
    const command=spawnSync("bash",[fileURLToPath(new URL("export-references.sh",import.meta.url)),pg,dump,extracted],
      {stdio:"ignore",timeout:30*60*1000});
    must(command.status===0 && !command.error,"RESTORED_PG_REFERENCE_EXTRACTION_FAILED");
    must(await digest(extracted)===m.refs.sha256,"RESTORED_PG_REFERENCE_MISMATCH");
  }
  async function readObject(e) {
    await retrieveFile(ctx,"objects/"+objectId(e.scope,e.key),tmp,e.cipherSha256);
    must((await stat(tmp)).size===e.size && await digest(tmp)===e.sha256,"ARCHIVE_OBJECT_HASH_MISMATCH");
  }
  // Authenticate all bytes before performing any write on the destination.
  for(const e of m.records) {
    try { await readObject(e); } finally { await rm(tmp,{force:true}); }
  }
  if(verifyOnly) {
    console.log(json({status:"ARCHIVE_VERIFIED_NO_RESTORE",id,objects:m.records.length,ota,unmapped:refs.unmapped}));
    return;
  }
  for(const target of Object.values(config.targets)) {
    assertPrivateBucket(target,ctx.local);
    must(list(target).length===0,"RESTORE_TARGET_NOT_EMPTY");
  }
  // All targets use separate credentials, isolated names and conditional PUT.
  // No ACL, source policy, cache purge, DNS or production release pointer writes.
  for(const e of m.records) {
    try {
      await readObject(e);
      const target=config.targets[e.scope];
      put(target,e.key,tmp,e.meta);
      const h=get(target,e.key,readback);
      must((await stat(readback)).size===e.size && await digest(readback)===e.sha256 &&
        Object.entries(e.meta).every(([k,v])=>same(v,metadata(h)[k])),"RESTORED_OBJECT_READBACK_MISMATCH");
    } finally { await Promise.all([rm(tmp,{force:true}),rm(readback,{force:true})]); }
  }
  for(const [scope,target] of Object.entries(config.targets)) {
    const expected=m.records.filter(e=>e.scope===scope).map(e=>[e.key,e.size]).sort();
    const actual=list(target).map(e=>[e.key,e.size]).sort();
    must(same(expected,actual),"RESTORED_SCOPE_INVENTORY_MISMATCH");
  }
  // Preserve the exact original compressed dump; never modify signed manifests
  // or substitute their URLs. A separate isolated API/CDN harness must consume it.
  await copyFile(dump,output,1);await chmod(output,0o600);
  console.log(json({status:"ISOLATED_OBJECT_RESTORE_BYTES_VERIFIED",id,objects:m.records.length,ota,unmapped:refs.unmapped,
    dbSha256:m.db.sha256,objectRestoreElapsedMs:Math.round(performance.now()-started),serviceRto:"UNVERIFIED",cdnAccessPolicy:"UNVERIFIED"}));
}
async function main() {
  const [mode,configPath,id,confirm,...args]=process.argv.slice(2);
  must(["backup","verify","restore","probe"].includes(mode) && ID.test(id||"") && confirm===mode+"-"+id,"EXPLICIT_CONFIRMATION_REQUIRED");
  must((mode==="backup"&&args.length===2)||(mode==="restore"&&args.length===1)||(mode==="verify"&&args.length===0)||(mode==="probe"&&args.length===1),"BAD_COMMAND_ARGUMENTS");
  const local=process.env.GAFUS_EXTERNAL_BACKUP_LOCAL_TEST==="1";
  const config=validateConfig(JSON.parse(await readFile(configPath,"utf8")),local);
  if(local) must([...Object.values(config.sources),config.archive,...Object.values(config.targets)].every(c=>new URL(c.endpoint).hostname==="127.0.0.1"),"LOCAL_TEST_REMOTE_FORBIDDEN");
  const keyPath=process.env.GAFUS_EXTERNAL_BACKUP_KEY_FILE;
  const scratch=process.env.GAFUS_EXTERNAL_BACKUP_SCRATCH;
  must(keyPath && scratch && resolve(scratch)===scratch,"KEY_AND_PRIVATE_SCRATCH_REQUIRED");
  await privateFile(keyPath);
  const st=await lstat(scratch);
  must(st.isDirectory() && (st.mode&0o077)===0 && await realpath(scratch)===scratch,"PRIVATE_SCRATCH_REQUIRED");
  const key=await readFile(keyPath);must(key.length===32,"KEY_MUST_BE_32_RANDOM_BYTES");
  const work=await mkdtemp(join(scratch,"gafus-external-"));
  await chmod(work,0o700);
  try {
    const ctx={config,id,key,work,local};
    if(mode==="backup") await backup(ctx,...args);
    else {
      if(mode==="restore") {
        const p=resolve(args[0]);
        must(p.slice(0,p.lastIndexOf("/"))===scratch,"DB_OUTPUT_MUST_BE_IN_PRIVATE_SCRATCH");
        // Reserve an absent output filename before any destination writes.
        try {await lstat(p);throw Error("DB_OUTPUT_EXISTS");}catch(e){if(e.code!=="ENOENT")throw e;}
      }
      await restore(ctx,args[0],mode==="verify",mode==="probe"?args[0]:undefined);
    }
  }finally{key.fill(0);await rm(work,{recursive:true,force:true});}
}
main().catch(error=>{
  // Never print raw paths, provider errors or private JSON.
  const code=/^[A-Z][A-Z0-9_]{2,100}$/.test(error?.message??"")?error.message:"EXTERNAL_BACKUP_FAILED";
  console.error(code);process.exitCode=1;
});
