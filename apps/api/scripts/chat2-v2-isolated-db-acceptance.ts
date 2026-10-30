/** One-shot Refactor-only real PostgreSQL acceptance: not part of API startup. */
import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {prisma} from '@gafus/prisma';
import {chat2V2SourceKey,chat2V2FinalKeys} from '@gafus/feed-cloud';
import {createChat2V2Queue} from '../src/modules/chat2/media-v2-jobs.js';

const raw=process.env.DATABASE_URL??'';
let database:URL;
try{database=new URL(raw);}catch{throw Error('DEV_CHAT2_DB_URL_REQUIRED');}
if(process.env.CHAT2_DB_ACCEPTANCE_ONLY!=='explicit-isolated-refactor-test' ||
   database.protocol!=='postgresql:' || database.hostname!=='127.0.0.1' ||
   database.port!=='55433' || database.pathname!=='/refactor_chat2_v2_dev_20261027' ||
   database.username!=='gafus_refactor_chat2' ||
   database.searchParams.get('schema')!=='public' || database.searchParams.size!==1 ||
   database.hash||!database.password)
  throw Error('REFUSE_NON_ISOLATED_DATABASE');
const mediaIds:string[]=[];
const removed:string[][]=[];
const checked:string[]=[];
const room='local_v2_acceptance_room',owner='local_v2_acceptance_actor';
const q=createChat2V2Queue({database:prisma,deleteObjects:async(keys)=>{removed.push([...keys]);},
  head:async url=>{checked.push(url);return {status:200,
    mime:url.endsWith('.mp4')?'video/mp4':'image/webp',bytes:url.endsWith('.mp4')?2048:256};}});
async function add(mime:'image/jpeg'|'image/png'|'video/mp4',data:Record<string,unknown>={}){
  const mediaId=randomUUID();mediaIds.push(mediaId);
  const sourceKey=chat2V2SourceKey(room,owner,mediaId,mime);
  await prisma.chat2V2MediaTask.create({data:{mediaId,conversationId:room,ownerId:owner,
    name:'Synthetic local acceptance only',sourceKey,sourceMime:mime,sourceBytes:512,
    status:'QUEUED',...data}});
  return {mediaId,sourceKey};
}
try{
  const baseline=await prisma.chat2V2MediaTask.count();
  assert.equal(baseline,0,'This isolated test DB must contain no task rows');
  const a=await add('image/jpeg');const b=await add('image/png');
  const v=await add('video/mp4');
  const claims=await Promise.all([q.claimOne('image'),q.claimOne('image')]);
  assert.equal(claims[0].jobs.length,1);assert.equal(claims[1].jobs.length,1);
  const first=claims[0].jobs[0]!;const second=claims[1].jobs[0]!;
  assert.notEqual(first.mediaId,second.mediaId,'SKIP LOCKED handed out the same image twice');
  assert.deepEqual(new Set([first.mediaId,second.mediaId]),new Set([a.mediaId,b.mediaId]));
  assert.deepEqual((await q.claimOne('image')).jobs,[]);
  const video=(await q.claimOne('video')).jobs[0]!;
  assert.equal(video.mediaId,v.mediaId,'Video must not be claimed by image pool');
  assert.equal((await q.renew(first.mediaId,first.attemptToken)).accepted,true);
  assert.equal((await q.renew(first.mediaId,randomUUID())).accepted,false);
  const imageKeys=chat2V2FinalKeys(room,owner,first.mediaId);
  const imageManifest={kind:'image' as const,width:720,height:480,keys:imageKeys.image,
    imageSizes:{small:{width:360,height:240},medium:{width:720,height:480}}};
  assert.equal((await q.complete(first.mediaId,first.attemptToken,imageManifest)).accepted,true);
  const saved=await prisma.chat2V2MediaTask.findUniqueOrThrow({where:{mediaId:first.mediaId}});
  assert.equal(saved.status,'READY');assert(saved.cleanupCompletedAt);
  assert.deepEqual(removed.at(-1),[saved.sourceKey],'Original alone deleted after READY');
  assert.equal((await q.fail(second.mediaId,second.attemptToken,'SYNTHETIC_FAILURE')).accepted,true);
  const backoff=await prisma.chat2V2MediaTask.findUniqueOrThrow({where:{mediaId:second.mediaId}});
  assert.equal(backoff.status,'QUEUED');assert(backoff.nextAttemptAt>new Date());
  const videoKeys=chat2V2FinalKeys(room,owner,v.mediaId);
  const manifest={kind:'video' as const,width:1280,height:720,durationSeconds:25,
    posterKey:videoKeys.video.poster,renditions:[
      {quality:360 as const,key:videoKeys.video.variants[360],width:640,height:360,bytes:2048},
      {quality:720 as const,key:videoKeys.video.variants[720],width:1280,height:720,bytes:2048},
    ]};
  assert.equal((await q.complete(video.mediaId,video.attemptToken,manifest)).accepted,true);
  assert(checked.length>=5,'Every variant HEAD is mandatory');
  assert.deepEqual(removed.at(-1),[v.sourceKey]);
  const expired=await add('image/jpeg',{status:'AWAITING_UPLOAD',createdAt:new Date(Date.now()-3_700_000)});
  assert.deepEqual(await q.cleanupPending(),{cleaned:true});
  const orphan=await prisma.chat2V2MediaTask.findUniqueOrThrow({where:{mediaId:expired.mediaId}});
  assert.equal(orphan.status,'EXPIRED');assert(orphan.cleanupCompletedAt);
  assert.equal(removed.at(-1)?.length,6,'Terminal orphan cleanup includes all potential outputs');
  console.log(JSON.stringify({database:'isolated_refactor_local_55433',
    imageConcurrentClaimsDistinct:true,typedVideoClaim:true,staleTokenRejected:true,
    readyManifestAndOnlyOriginalRemoved:true,retryBackoff:true,
    expiredFullCleanup:true,variantHeadChecks:checked.length,passed:true}));
}finally{
  if(mediaIds.length)await prisma.chat2V2MediaTask.deleteMany({where:{mediaId:{in:mediaIds}}});
  await prisma.$disconnect();
}
