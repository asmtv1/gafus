/** Real Redis replay protection + Hono signed Core handler on isolated DEV DB.
 * No public server, external requests, S3 actions or production credentials.
 */
import {strict as assert} from 'node:assert';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {Hono} from 'hono';
import {connection} from '@gafus/queues';
import {prisma} from '@gafus/prisma';
import {internalChat2MediaJobRoutes} from '../src/routes/internal/chat2-media-jobs.js';

const db=new URL(process.env.DATABASE_URL??'postgresql://invalid/invalid');
const secret=process.env.CHAT2_INTERNAL_HMAC_SECRET??'';
if(process.env.CHAT2_DB_ACCEPTANCE_ONLY!=='explicit-isolated-refactor-test' ||
  process.env.CHAT2_V2_CORE_ENABLED!=='true' || process.env.CHAT2_V2_MEDIA_ENABLED==='true' ||
  process.env.REDIS_URL!=='redis://127.0.0.1:55929/2' ||
  db.hostname!=='127.0.0.1'||db.port!=='55433'||
  db.pathname!=='/refactor_chat2_v2_dev_20261027'||db.username!=='gafus_refactor_chat2'||
  db.searchParams.get('schema')!=='public'||db.searchParams.size!==1||!db.password||secret.length<32)
  throw Error('CHAT2_HMAC_ISOLATION_GUARD_FAILED');
const app=new Hono().route('/internal/chat2/media/jobs',internalChat2MediaJobRoutes);
const path='/internal/chat2/media/jobs/claim';
function signed(endpoint:string,payload:string,nonce=randomUUID(),badSignature=false){
 const timestamp=String(Math.floor(Date.now()/1000));
 const sha=createHash('sha256').update(payload).digest('hex');
 const signature=createHmac('sha256',secret).update(`POST\n${endpoint}\n${timestamp}\n${nonce}\n${sha}`).digest('hex');
 return new Request(`http://127.0.0.1:3701${endpoint}`,{method:'POST',
  headers:{'content-type':'application/json','x-chat2-timestamp':timestamp,
   'x-chat2-nonce':nonce,'x-chat2-signature':badSignature?'0'.repeat(64):signature},
  body:payload});
}
try{
 await connection.ping();
 assert.equal(await prisma.chat2V2MediaTask.count(),0);
 const payload=JSON.stringify({batchSize:1,kind:'image'}),nonce=randomUUID();
 const accepted=await app.request(signed(path,payload,nonce));
 assert.equal(accepted.status,200);
 assert.deepEqual(await accepted.json(),{jobs:[]});
 const repeated=await app.request(signed(path,payload,nonce));
 assert.equal(repeated.status,401,'Redis must reject a reused signed nonce');
 const video=await app.request(signed(path,JSON.stringify({batchSize:1,kind:'video'})));
 assert.equal(video.status,200);assert.deepEqual(await video.json(),{jobs:[]});
 const malformed=await app.request(signed(path,JSON.stringify({batchSize:1,kind:'untrusted'})));
 assert.equal(malformed.status,400);
 const forged=await app.request(signed(path,payload,randomUUID(),true));
 assert.equal(forged.status,401);
 const clean=await app.request(signed('/internal/chat2/media/jobs/cleanup',JSON.stringify({batchSize:1})));
 assert.equal(clean.status,200);assert.deepEqual(await clean.json(),{cleaned:false});
 assert.equal(await prisma.chat2V2MediaTask.count(),0);
 console.log(JSON.stringify({isolatedRedisPort:55929,isolatedPostgresPort:55433,
  validSignedImageAndVideoClaim:true,nonceReplayRejected:true,wrongKindRejected:true,
  invalidHmacRejected:true,emptyCleanupSafe:true,noTaskMutations:true,passed:true}));
}finally{
 await connection.quit();await prisma.$disconnect();
}
