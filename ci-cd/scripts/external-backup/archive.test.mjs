import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, X509Certificate } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seal, unseal, verifyOta, validateConfig, metadata } from "./archive.mjs";
import { otaFixture } from "./test-fixtures.mjs";
test("streaming AES-GCM roundtrip, wrong key, authenticated path and corruption",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"gafus-crypto-"));
 try {
  const key=randomBytes(32),src=join(dir,"src"),cipher=join(dir,"sealed"),out=join(dir,"out");
  const bytes=randomBytes(1024*1024+7);await writeFile(src,bytes);
  await seal(src,cipher,key,"snapshot/objects/one");
  await unseal(cipher,out,key,"snapshot/objects/one");
  assert.deepEqual(await readFile(out),bytes);
  await assert.rejects(unseal(cipher,join(dir,"wrong-key"),randomBytes(32),"snapshot/objects/one"),/BACKUP_AUTHENTICATION_FAILED/);
  await assert.rejects(unseal(cipher,join(dir,"bad-path"),key,"snapshot/objects/two"),/BACKUP_AUTHENTICATION_FAILED/);
  const corrupt=await readFile(cipher);corrupt[corrupt.length-20]^=1;await writeFile(cipher,corrupt);
  await assert.rejects(unseal(cipher,join(dir,"bad"),key,"snapshot/objects/one"),/BACKUP_AUTHENTICATION_FAILED/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("empty object roundtrip",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"gafus-crypto-"));
 try {
  const key=randomBytes(32),src=join(dir,"src"),cipher=join(dir,"sealed"),out=join(dir,"out");
  await writeFile(src,Buffer.alloc(0));await seal(src,cipher,key,"empty");await unseal(cipher,out,key,"empty");
  assert.equal((await readFile(out)).length,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("scope coverage and strict isolated target/credential fences",async()=>{
 const c=JSON.parse(await readFile(new URL("config.example.json",import.meta.url),"utf8"));
 assert.equal(validateConfig(c),c);
 const mutate=fn=>{const n=structuredClone(c);fn(n);return n;};
 assert.throws(()=>validateConfig(mutate(n=>delete n.sources.public)),/SCOPE_INVENTORY_INCOMPLETE/);
 assert.throws(()=>validateConfig(mutate(n=>n.targets.feed.bucket=n.sources.feed.bucket)),/TARGET_NOT_ISOLATED/);
 assert.throws(()=>validateConfig(mutate(n=>n.targets.feed.profile=n.sources.feed.profile)),/SEPARATE_CREDENTIALS_REQUIRED/);
 assert.throws(()=>validateConfig(mutate(n=>n.archive.endpoint=n.sources.public.endpoint)),/ARCHIVE_NOT_INDEPENDENT/);
 assert.throws(()=>validateConfig(mutate(n=>n.sources.feed.prefix="subset")),/PARTIAL_BUCKET_NOT_SUPPORTED/);
 assert.throws(()=>validateConfig(mutate(n=>n.otaOrigin="https://evil.test/wrong")),/BAD_OTA_ORIGIN/);
});
test("real RSA signed OTA bytes, pinned native certificate and asset digest",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"gafus-ota-backup-cert-"));
 try {
  const {r,inventory,trust}=await otaFixture(dir);
  const origin="https://example.test/ota-bucket";
  assert.deepEqual(verifyOta([r],origin,inventory,trust),{releases:1,previous:1,active:0,expiredHistorical:0});
  assert.throws(()=>verifyOta([r],origin,inventory,{}),/OTA_NATIVE_TRUST_MISMATCH/);
  assert.throws(()=>verifyOta([r],origin,new Map(),trust),/OTA_BACKUP_BYTES_MISMATCH/);
  assert.throws(()=>verifyOta([{...r,manifestHex:Buffer.from("{}").toString("hex")}],origin,inventory,trust),/OTA_SIGNATURE_INVALID/);
  assert.throws(()=>verifyOta([r],origin,inventory,trust,Date.parse(new X509Certificate(r.certificatePem).validTo)+1000),/OTA_ACTIVE_OR_PREVIOUS_CERT_EXPIRED/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("metadata preserves response headers but not ACL or redirects",()=>{
 assert.deepEqual(metadata({ContentType:"image/webp",Metadata:{b:"2",a:"1"},CacheControl:"private",
  ACL:"public-read",WebsiteRedirectLocation:"https://example.test",SSECustomerKey:"secret"}),
 {ContentType:"image/webp",CacheControl:"private",Metadata:{a:"1",b:"2"}});
});
