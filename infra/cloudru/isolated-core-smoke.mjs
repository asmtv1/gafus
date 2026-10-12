import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { signGalleryRequest } from '../../packages/gallery-storage/dist/hmac.js';
import { signFeedRequest } from '../../packages/feed-cloud/dist/hmac.js';
const txt=await readFile(join(homedir(),'.codex/cloudru/gafus-media-core-staging/core.env'),'utf8');
const x=Object.fromEntries(txt.split('\n').filter(y=>y.includes('=')).map(z=>z.split('=',2)));
const base=process.env.GAFUS_STAGING_CORE_URL||'http://127.0.0.1:31339';
const u=new URL(base);
if ((u.hostname!=='127.0.0.1' && !u.hostname.endsWith('.ngrok-free.dev')) ||
    (u.protocol!=='https:' && u.hostname!=='127.0.0.1') || u.pathname!=='/')
  throw Error('UNVERIFIED_STAGING_CORE_URL');
const calls=[
 {name:'gallery',path:'/internal/gallery/maintenance',body:JSON.stringify({limit:1}),headers:()=>signGalleryRequest({method:'POST',path:'/internal/gallery/maintenance',body:JSON.stringify({limit:1}),secret:x.GALLERY_INTERNAL_HMAC_SECRET})},
 {name:'feed',path:'/internal/feed/jobs/claim',body:JSON.stringify({batchSize:1,workerType:'photo'}),headers:()=>signFeedRequest({path:'/internal/feed/jobs/claim',body:JSON.stringify({batchSize:1,workerType:'photo'}),key:Buffer.from(x.FEED_INTERNAL_HMAC_SECRET)})},
];
for(const item of calls){
 const req=async(headers)=>fetch(base+item.path,{method:'POST',headers:{'content-type':'application/json',...headers},body:item.body,signal:AbortSignal.timeout(15000)});
 const unsigned=await req({});await unsigned.body?.cancel();
 const auth=item.headers();
 const authorized=await req(auth),payload=await authorized.text();
 const replay=await req(auth);await replay.body?.cancel();
 const modified=await req({...auth,[Object.keys(auth).find(k=>k.endsWith('signature'))]:'0'.repeat(64)});await modified.body?.cancel();
 console.log(JSON.stringify({scope:item.name,origin:u.hostname,unauthenticated:unsigned.status,authorized:authorized.status,replay:replay.status,tampered:modified.status,bodyShape:item.name==='feed'?(Array.isArray(JSON.parse(payload))?'array':'other'):Object.keys(JSON.parse(payload)).slice(0,8)}));
 if(unsigned.status!==401||authorized.status!==200||replay.status!==401||modified.status!==401)
   throw Error('ISOLATED_CORE_HMAC_SMOKE_FAILED');
}
