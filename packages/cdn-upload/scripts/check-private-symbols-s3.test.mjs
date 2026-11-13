import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {probeConfig,runPrivateSymbolsProbe,BUCKET} from './check-private-symbols-s3.mjs';

const valid =()=>({
 CI:'true',GAFUS_TELEMETRY_PRODUCTION_APPROVED:'false',
 GAFUS_SYMBOLS_PROBE_ALLOWED:'true',
 SYMBOLS_S3_PROBE_CONFIRMATION:'gafus-symbols-private-only',
 SYMBOLS_S3_BUCKET:BUCKET,SYMBOLS_S3_ENDPOINT:'https://s3.cloud.ru',
 SYMBOLS_S3_REGION:'ru-central-1',
 SYMBOLS_S3_ACCESS_KEY:'00000000-0000-0000-0000-000000000000:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
 SYMBOLS_S3_SECRET_KEY:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
});
const deterministic={
 random:()=>('c'.repeat(32)),now:new Date('2026-11-14T00:00:00Z')
};
function fakeS3({mismatch=false,deny=false,failDelete=false,keepAfterDelete=false}={}){
 const storage=new Map();
 const commands=[];
 return {
  storage,commands,
  async send(command){
   const type=command.constructor.name;
   commands.push(type);
   const x=command.input;
   assert.equal(x.Bucket,BUCKET);
   assert.match(x.Key,/^symbols-privacy-smoke\/2026-11-14\/c{32}\.json$/);
   if(type==='PutObjectCommand'){
    assert.equal(x.IfNoneMatch,'*');
    storage.set(x.Key,Buffer.from(x.Body));
    return {};
   }
   if(type==='HeadObjectCommand'){
    const b=storage.get(x.Key);
    if(!b)throw Object.assign(Error('NotFound'),{$metadata:{httpStatusCode:404}});
    return {ContentLength:mismatch?b.length+1:b.length,
     Metadata:{sha256:createHash('sha256').update(b).digest('hex')}};
   }
   if(type==='GetObjectCommand'){
    const b=storage.get(x.Key);
    return {Body:{transformToByteArray:async()=>new Uint8Array(b)}};
   }
   if(type==='DeleteObjectCommand'){
    if(failDelete)throw Error('DELETE_FAILED');
    if(!keepAfterDelete)storage.delete(x.Key);
    return {};
   }
   throw Error('UNEXPECTED_COMMAND_'+type);
  },
  async fakeFetch(url,{redirect}){
   assert.equal(redirect,'manual');
   assert.match(url,/^https:\/\/s3\.cloud\.ru\/gafus-symbols-private/);
   return {status:deny?200:403};
  }
 };
}
test('private S3 config pins exact provider, bucket, CI and manual approval',()=>{
 const c=probeConfig(valid());
 assert.equal(c.endpoint,'https://s3.cloud.ru');
 assert.equal(c.bucket,'gafus-symbols-private');
 for(const [field,value] of [
  ['CI','false'],['GAFUS_TELEMETRY_PRODUCTION_APPROVED','true'],
  ['GAFUS_SYMBOLS_PROBE_ALLOWED','false'],
  ['SYMBOLS_S3_PROBE_CONFIRMATION','not-confirmed'],
  ['SYMBOLS_S3_BUCKET','gafus-ota-updates'],
  ['SYMBOLS_S3_ENDPOINT','https://evil.example'],
  ['SYMBOLS_S3_REGION','us-east-1'],
  ['SYMBOLS_S3_ACCESS_KEY',''],['SYMBOLS_S3_SECRET_KEY','']]){
  const c={...valid(),[field]:value};
  assert.throws(()=>probeConfig(c),/PRIVATE_SYMBOLS_S3_/);
 }
});
test('synthetic signed PUT/HEAD/GET and two anonymous 403 replies clean up',async()=>{
 const fake=fakeS3();
 const result=await runPrivateSymbolsProbe(fake,{...deterministic,fetcher:fake.fakeFetch});
 assert.equal(result.status,'PASS');
 assert.equal(result.anonymousObjectStatus,403);
 assert.equal(result.anonymousListStatus,403);
 assert.deepEqual(fake.commands,[
  'PutObjectCommand','HeadObjectCommand','GetObjectCommand','DeleteObjectCommand',
  'HeadObjectCommand']);
 assert.equal(fake.storage.size,0);
});
test('unexpected anonymous public HTTP 200 fails and removes test object',async()=>{
 const fake=fakeS3({deny:true});
 await assert.rejects(runPrivateSymbolsProbe(fake,
  {...deterministic,fetcher:fake.fakeFetch}),/ANONYMOUS_READ_NOT_PROVEN_PRIVATE/);
 assert.equal(fake.storage.size,0);
});
test('mismatched signed HEAD fails and removes test object',async()=>{
 const fake=fakeS3({mismatch:true});
 await assert.rejects(runPrivateSymbolsProbe(fake,
  {...deterministic,fetcher:fake.fakeFetch}),/HEAD_MISMATCH/);
 assert.equal(fake.storage.size,0);
});
test('delete error never produces PASS',async()=>{
 const fake=fakeS3({failDelete:true});
 await assert.rejects(runPrivateSymbolsProbe(fake,
  {...deterministic,fetcher:fake.fakeFetch}),/DELETE_FAILED/);
});
test('invalid anonymous status 500 fails closed and removes object',async()=>{
 const fake=fakeS3();
 await assert.rejects(runPrivateSymbolsProbe(fake,{...deterministic,
  fetcher:async()=>({status:500})}),/ANONYMOUS_READ_NOT_PROVEN_PRIVATE/);
 assert.equal(fake.storage.size,0);
});

test('delete 200 with still-readable object is never accepted',async()=>{
 const fake=fakeS3({keepAfterDelete:true});
 await assert.rejects(runPrivateSymbolsProbe(fake,
  {...deterministic,fetcher:fake.fakeFetch}),/CLEANUP_NOT_CONFIRMED/);
 assert.equal(fake.storage.size,1);
});
