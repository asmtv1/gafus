/** Isolated real Cloud.ru staging origin E2E: disposable private S3 UUID keys only. */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
const env = process.env;
if (env.CLOUDRU_STAGE_SMOKE_CONFIRM !== 'uuid-only-and-cleanup' || env.CLOUDRU_S3_ENDPOINT !== 'https://s3.cloud.ru')
  throw Error('STAGING_SMOKE_UNAUTHORIZED');
const gallerySecret = parse(await readFile('.env')).TF_VAR_origin_secret;
const feedSecret = (await readFile(join(homedir(),'.codex/cloudru/staging-origin-feed-secret'),'utf8')).trim();
if (gallerySecret?.length < 32 || feedSecret.length < 32) throw Error('STAGING_ORIGIN_SECRET_MISSING');
const require = createRequire(fileURLToPath(new URL('../../apps/gallery-cloud/package.json',import.meta.url)));
const sharp = require('sharp');
const image=await sharp({create:{width:8,height:8,channels:3,background:{r:71,g:131,b:48}}}).webp().toBuffer();
const segment=Buffer.alloc(376,0x47);
const client=new S3Client({endpoint:'https://s3.cloud.ru',region:'ru-central-1',forcePathStyle:true,maxAttempts:1,
  credentials:{accessKeyId:env.CLOUDRU_S3_ACCESS_KEY_ID,secretAccessKey:env.CLOUDRU_S3_SECRET_ACCESS_KEY}});
const galleryKey=`albums/__gafus_cloudru_validation__/staging/photos/${randomUUID()}/full.webp`;
const id=randomUUID();
const feedPoster=`posts/__gafus_cloudru_validation__/staging/attachments/${id}/poster.webp`;
const feedSegment=`posts/__gafus_cloudru_validation__/staging/attachments/${id}/hls/segment-000.ts`;
const fixtures=[
  {bucket:'gafus-gallery-private',key:galleryKey,data:image,mime:'image/webp',base:'https://gafus-gallery-origin-staging.containerapps.ru',header:'x-gallery-origin-secret',secret:gallerySecret},
  {bucket:'gafus-feed-private',key:feedPoster,data:image,mime:'image/webp',base:'https://gafus-feed-origin-staging.containerapps.ru',header:'x-feed-origin-secret',secret:feedSecret},
  {bucket:'gafus-feed-private',key:feedSegment,data:segment,mime:'video/mp2t',base:'https://gafus-feed-origin-staging.containerapps.ru',header:'x-feed-origin-secret',secret:feedSecret},
];
const created=[];
async function call(f,method='GET',extra={},key=f.key){
  let r;
  for(let i=0;i<3;i++){
    r=await fetch(`${f.base}/${key}`,{method,headers:{[f.header]:f.secret,...extra},redirect:'manual',signal:AbortSignal.timeout(35000)});
    if(r.status!==503&&r.status!==502&&r.status!==504)break;
    await r.body?.cancel(); await new Promise(resolve=>setTimeout(resolve,1500));
  }
  return r;
}
try {
 for(const f of fixtures){
  await client.send(new PutObjectCommand({Bucket:f.bucket,Key:f.key,Body:f.data,ContentType:f.mime,
    CacheControl:'private, no-store',IfNoneMatch:'*'})); created.push(f);
  const out={scope:f.bucket,fileType:f.mime,httpsGet:false,head:false,range:false,unauthorizedDenied:false,
    nonStagingKeyDenied:false,badRange:false};
  const get=await call(f);
  out.getStatus=get.status;out.httpsGet=get.status===200&&Buffer.from(await get.arrayBuffer()).equals(f.data);
  const head=await call(f,'HEAD');out.head=head.status===200&&Number(head.headers.get('content-length'))===f.data.length;await head.body?.cancel();
  const range=await call(f,'GET',{Range:'bytes=0-3'});out.range=range.status===206&&
    (range.headers.get('content-range')??'').startsWith('bytes 0-3/')&&
    Buffer.from(await range.arrayBuffer()).equals(f.data.subarray(0,4));
  const invalid=await call(f,'GET',{Range:'bytes=999999-'});out.badRange=invalid.status===416;await invalid.body?.cancel();
  const anonymous=await fetch(`${f.base}/${f.key}`,{redirect:'manual',signal:AbortSignal.timeout(25000)});
  out.unauthorizedDenied=anonymous.status===403;await anonymous.body?.cancel();
  const userKey=f.key.replace('/__gafus_cloudru_validation__/', '/actual-user/');
  const denied=await call(f,'GET',{},userKey);out.nonStagingKeyDenied=denied.status===404;await denied.body?.cancel();
  console.log(JSON.stringify(out));
  if(![out.httpsGet,out.head,out.range,out.badRange,out.unauthorizedDenied,out.nonStagingKeyDenied].every(Boolean))
    throw Error('STAGING_ORIGIN_HTTP_E2E_FAILED');
 }
} finally {
 for(const f of created){
  let removed=false;
  try{await client.send(new DeleteObjectCommand({Bucket:f.bucket,Key:f.key}));
    try{await client.send(new HeadObjectCommand({Bucket:f.bucket,Key:f.key}));}
    catch(e){removed=e?.$metadata?.httpStatusCode===404;}
  }catch{}
  console.log(JSON.stringify({scope:f.bucket,type:f.mime,testObjectRemoved:removed}));
  if(!removed) process.exitCode=1;
 }
 client.destroy();
}
