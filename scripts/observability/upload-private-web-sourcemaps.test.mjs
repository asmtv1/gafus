import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm,chmod,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PutObjectCommand,HeadObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {planWebSymbolUpload,verifyWebSymbolUploadConfig,uploadPrivateWebSymbols}
  from './upload-private-web-sourcemaps.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'gafus-private-web-symbols-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 await chmod(dir,0o700);
 const root=join(dir,'gafus-web','a'.repeat(40),'build0001');
 await mkdir(join(root,'assets'),{recursive:true,mode:0o700});
 const file=join(root,'assets','index.abc.js.map');
 const bytes=Buffer.from(JSON.stringify({version:3,sources:['../src/main.ts'],names:[],mappings:'AAAA',sourcesContent:['export default 1;']}));
 await writeFile(file,bytes,{mode:0o600});
 const manifest={schemaVersion:1,service:'gafus-web',releaseSha:'a'.repeat(40),
  build:'build0001',artifacts:[{
   asset:'assets/index.abc.js',assetSha256:'b'.repeat(64),
   privateMap:'assets/index.abc.js.map',mapSha256:sha(bytes),mapBytes:bytes.length,
  }]};
 await writeFile(join(root,'manifest.json'),JSON.stringify(manifest),{mode:0o600});
 return {root,file,bytes,manifest};
}
test('manifest checks release IDs, private directory permissions and map SHA',async t=>{
 const x=await fixture(t),plan=await planWebSymbolUpload(x.root);
 assert.equal(plan.records.length,1);
 assert.equal(plan.records[0].sha256,sha(x.bytes));
 assert.equal(plan.manifestHash.length,64);
 await writeFile(x.file,'{tampered}',{mode:0o600});
 await assert.rejects(planWebSymbolUpload(x.root),/PRIVATE_MAP_FILE_INSECURE|PRIVATE_MAP_SHA_MISMATCH/);
});
test('malicious traversal and public-bucket config fail before ANY network',async t=>{
 const x=await fixture(t);
 const m={...x.manifest,artifacts:[{...x.manifest.artifacts[0],privateMap:'../production/secret.js.map'}]};
 await writeFile(join(x.root,'manifest.json'),JSON.stringify(m));
 await assert.rejects(planWebSymbolUpload(x.root),/PRIVATE_MAP_RECORD_INVALID/);
 await writeFile(join(x.root,'manifest.json'),JSON.stringify(x.manifest));
 const plan=await planWebSymbolUpload(x.root);
 const env={
  CI:'true',GAFUS_WEB_SYMBOLS_VERIFIED_BUILD:'true',
  GAFUS_TELEMETRY_ENVIRONMENT:'preview',
  GAFUS_WEB_SYMBOLS_PREVIEW_APPROVED:'true',
  GAFUS_RELEASE_SHA:'a'.repeat(40),VITE_GAFUS_BUILD_ID:'build0001',
  GAFUS_WEB_SYMBOLS_BUCKET:'gafus-private-symbols-qa',
  GAFUS_WEB_SYMBOLS_S3_ENDPOINT:'https://s3.cloud.ru',
  GAFUS_WEB_SYMBOLS_ACCESS_KEY:'SYNTHETIC_ACCESS_KEY_123',
  GAFUS_WEB_SYMBOLS_SECRET_KEY:'SYNTHETIC_SECRET_KEY_123',
 };
 assert.equal(verifyWebSymbolUploadConfig(plan,env).environment,'preview');
 assert.throws(()=>verifyWebSymbolUploadConfig(plan,{...env,GAFUS_WEB_SYMBOLS_BUCKET:'gafus-public-gallery'}),
   /SYMBOLS_PRIVATE_BUCKET_CONFIG_INVALID/);
 assert.throws(()=>verifyWebSymbolUploadConfig(plan,{...env,CI:'false'}),
   /SYMBOLS_CI_RELEASE_NOT_VERIFIED/);
 assert.throws(()=>verifyWebSymbolUploadConfig(plan,{
  ...env,GAFUS_TELEMETRY_ENVIRONMENT:'production',
 }),/SYMBOLS_PRODUCTION_NOT_APPROVED/);
});
test('upload is immutable and verifies both HEAD and GET of each object',async t=>{
 const x=await fixture(t),plan=await planWebSymbolUpload(x.root);
 const objects=new Map();
 const client={async send(command,{abortSignal}){
  assert.ok(abortSignal instanceof AbortSignal);
  const req=command.input;
  if(command instanceof PutObjectCommand) {
    assert.equal(req.ACL,undefined);
    assert.equal(req.IfNoneMatch,'*');
    assert.equal(req.CacheControl,'private, max-age=31536000, immutable');
    if(objects.has(req.Key))throw Object.assign(new Error('already exists'),{
     $metadata:{httpStatusCode:412},
    });
    objects.set(req.Key,{data:Buffer.from(req.Body),mime:req.ContentType,metadata:req.Metadata});
    return {};
  }
  const old=objects.get(req.Key);
  if(!old)throw Error('UNKNOWN_OBJECT');
  if(command instanceof HeadObjectCommand)
    return {ContentLength:old.data.length,ContentType:old.mime,Metadata:old.metadata};
  if(command instanceof GetObjectCommand)
    return {Body:{transformToByteArray:async()=>new Uint8Array(old.data)}};
  throw Error('UNKNOWN_METHOD');
 }};
 const report=await uploadPrivateWebSymbols(client,'gafus-private-symbols-qa',plan,'preview');
 assert.equal(report.length,2);
 assert.ok(report.every(r=>r.verified&&r.key.startsWith('symbols/preview/web/gafus-web/')));
 assert.ok(report.some(r=>r.key.endsWith('/manifest.json')));
 assert.ok(report.some(r=>r.key.endsWith('/assets/index.abc.js.map')));
 const retry=await uploadPrivateWebSymbols(client,'gafus-private-symbols-qa',plan,'preview');
 assert.ok(retry.every(r=>r.verified&&!r.written));
});

test('a failed object readback reports a safe reason and leaves the manifest unpublished',async t=>{
 const x=await fixture(t),plan=await planWebSymbolUpload(x.root);
 const client={async send(command){
  assert.ok(!command.input.Key.endsWith('/manifest.json'));
  if(command instanceof PutObjectCommand)return {};
  if(command instanceof HeadObjectCommand)return {
   ContentLength:x.bytes.length,ContentType:'application/json',Metadata:{sha256:sha(x.bytes)},
  };
  throw Object.assign(new Error('remote error with request details'),{$metadata:{httpStatusCode:503}});
 }};
 await assert.rejects(uploadPrivateWebSymbols(client,'gafus-private-symbols-qa',plan,'preview'),
   {message:'SYMBOLS_S3_GET_HTTP_503'});
});
