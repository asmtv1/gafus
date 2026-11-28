import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PutObjectCommand,HeadObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {planPrivateSymbolUpload,uploadPrivateSymbols,verifyConfig} from './upload-mobile-private-symbols.mjs';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-symbol-upload-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const map=Buffer.from(JSON.stringify({version:3,sources:['./example.ts'],names:['f'],mappings:'AAAA',sourcesContent:['export default 1;']}));
 const expanded=Buffer.concat([map,Buffer.from(' '.repeat(2000))]);
 const hash=digest(expanded);fs.writeFileSync(path.join(root,hash+'.map'),expanded,{mode:0o600});
 const m={schemaVersion:1,private:true,retentionClass:'release-symbols',
 environment:'preview',platform:'ios',runtimeVersion:'1.8.0',updateId:'b6b9dc0d-7e53-4da4-8f20-910fd3520be6',
 sourceSha:'a'.repeat(40),revision:1,maps:[{filename:hash+'.map',sha256:hash,sizeBytes:expanded.length,
 sourceCount:1,logicalBundle:'test.hbc'}]};
 fs.writeFileSync(path.join(root,'private-symbol-manifest.json'),JSON.stringify(m),{mode:0o600});
 return {root,hash};
}
test('standalone CLI dry run plans private symbols without uploading or creating a delivery receipt',t=>{
 const {root}=fixture(t);
 const cli=fileURLToPath(new URL('./upload-mobile-private-symbols.mjs',import.meta.url));
 const result=JSON.parse(execFileSync(process.execPath,[cli,'--directory',root],{
  env:{...process.env,SYMBOLS_UPLOAD_EXECUTE:'0'},encoding:'utf8'}));
 assert.equal(result.state,'PRIVATE_SYMBOLS_DRY_RUN_NOT_UPLOADED');
 assert.equal(result.count,2);
 assert.equal(fs.existsSync(path.join(root,'private-symbol-delivery-evidence.json')),false);
});
test('private map plan uses immutable keys, never public OTA or CDN keys',t=>{
 const x=fixture(t),p=planPrivateSymbolUpload(x.root);
 assert.equal(p.records.length,2);
 assert(p.records.every(r=>r.key.startsWith('symbols/preview/gafus/1.8.0/ios/')));
 assert(p.records.every(r=>!r.key.startsWith('ota/')));
 assert(p.records[0].sha256===x.hash);
});
test('private source map identity pins production to verified OTA runtime 1.7.5', t=>{
 const x=fixture(t), manifest=path.join(x.root,'private-symbol-manifest.json');
 const m=JSON.parse(fs.readFileSync(manifest,'utf8'));
 m.environment='production';m.platform='android';m.runtimeVersion='1.7.5';
 fs.writeFileSync(manifest,JSON.stringify(m),{mode:0o600});
 const plan=planPrivateSymbolUpload(x.root);
 assert.equal(plan.runtime,'1.7.5');
 assert.equal(plan.environment,'production');
 assert(plan.records.every(r=>r.key.startsWith('symbols/production/gafus/1.7.5/android/')));
 for(const [environment,runtime] of [['production','1.8.0'],['preview','1.7.5'],['production','1.7.4']]){
  fs.writeFileSync(manifest,JSON.stringify({...m,environment,runtimeVersion:runtime}),{mode:0o600});
  assert.throws(()=>planPrivateSymbolUpload(x.root),/SYMBOLS_IDENTITY_INVALID/);
 }
});
test('tampered map fails before attempting S3',t=>{
 const x=fixture(t);fs.appendFileSync(path.join(x.root,x.hash+'.map'),'secret');
 assert.throws(()=>planPrivateSymbolUpload(x.root),/MAP_CHANGED/);
});
test('simulated immutable private S3 upload verifies HEAD and GET byte-for-byte',async t=>{
 const x=fixture(t),p=planPrivateSymbolUpload(x.root),objects=new Map();
 const client={async send(cmd){const i=cmd.input;
  if(cmd instanceof PutObjectCommand){
    assert.equal(i.IfNoneMatch,'*');assert(!i.ACL);assert.equal(i.CacheControl,'private, max-age=31536000, immutable');
    objects.set(i.Key,{Body:Buffer.from(i.Body),ContentType:i.ContentType,Metadata:i.Metadata});
    return {};
  }
  const value=objects.get(i.Key);
  if(cmd instanceof HeadObjectCommand) return {ContentLength:value.Body.length,ContentType:value.ContentType,Metadata:value.Metadata};
  if(cmd instanceof GetObjectCommand) return {Body:{transformToByteArray:async()=>new Uint8Array(value.Body)}};
  throw Error('Unknown command');
 }};
 const reports=await uploadPrivateSymbols(client,'private-symbols-bucket',p);
 assert.equal(reports.length,2);assert(reports.every(x=>x.verified));
 assert.equal(objects.size,2);
});

test('private archive cannot be a symlink or have world-readable source maps',t=>{
 const x=fixture(t), map=path.join(x.root,x.hash+'.map');
 fs.chmodSync(map,0o644);
 assert.throws(()=>planPrivateSymbolUpload(x.root),/PRIVATE_MAP_INSECURE/);
 fs.chmodSync(map,0o600);
 const manifest=path.join(x.root,'private-symbol-manifest.json');
 fs.chmodSync(manifest,0o644);
 assert.throws(()=>planPrivateSymbolUpload(x.root),/PRIVATE_MANIFEST_INSECURE/);
});
test('native private-symbol exporter never sends credentials to a non-Cloud.ru S3 host',t=>{
 const x=fixture(t),p=planPrivateSymbolUpload(x.root);
 const env={
  CI:'true',SYMBOLS_NATIVE_RELEASE_VERIFIED:'true',
  GAFUS_SYMBOLS_PREVIEW_APPROVED:'true',
  SYMBOLS_S3_BUCKET:'gafus-private-maps',
  OTA_S3_BUCKET:'gafus-public-ota',
  SYMBOLS_S3_ENDPOINT:'https://s3.cloud.ru',
  SYMBOLS_S3_ACCESS_KEY:'SYNTHETIC_KEY_123456789',
  SYMBOLS_S3_SECRET_KEY:'SYNTHETIC_SECRET_123456789',
 };
 assert.equal(verifyConfig(p,env).endpoint,'https://s3.cloud.ru');
 assert.throws(()=>verifyConfig(p,{...env,SYMBOLS_S3_ENDPOINT:'https://attacker.example'}),
  /ENDPOINT_UNTRUSTED/);
 assert.throws(()=>verifyConfig(p,{...env,GAFUS_SYMBOLS_PREVIEW_APPROVED:'false'}),
  /PREVIEW_APPROVAL_REQUIRED/);
});
