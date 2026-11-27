/** Real SQL-lease Worker, synthetic account deletion and fully mocked external storage/CDN. */
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {writeFileSync,readFileSync,realpathSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
const fake=vi.hoisted(()=>({objects:new Map<string,Set<string>>(),events:[] as any[],
  purges:new Map<string,boolean>(),submit:0,sweep:0,poll:0}));
vi.mock('@gafus/cdn-upload',async importActual=>{
 const actual=await importActual<typeof import('@gafus/cdn-upload')>();
 return {...actual,
  createAccountStorageCleaner:(scope:string)=>({sweep:async(targets:{prefixes:string[],keys:string[]})=>{
    const store=fake.objects.get(scope);
    if(!store)throw Error('QA_UNAUTHORIZED_FAKE_STORAGE_SCOPE');
    const removed=[...store].filter(k=>targets.prefixes.some(p=>k.startsWith(p))||targets.keys.includes(k));
    for(const k of removed)store.delete(k);
    fake.sweep++;
    fake.events.push({kind:'fake_sweep',scope,prefixes:targets.prefixes,keys:targets.keys,removed});
    return removed.length;
  }}),
  startAccountCdnPurge:async(scope:string,targets:any,existing:string[],checkpoint:any)=>{
    const op=`fake-${scope}-${++fake.submit}`;fake.purges.set(op,false);
    fake.events.push({kind:'fake_cdn_submit',scope,op,prefixes:targets.prefixes});
    const operations=[...existing,op];if(checkpoint)await checkpoint(operations);
    return operations;
  },
  accountCdnPurgeDone:async(operations:string[],checkpoint:any)=>{
    fake.poll++;const ok=operations.length===1&&operations.every(op=>fake.purges.get(op)===true);
    fake.events.push({kind:'fake_cdn_ack',operations,ok});
    if(checkpoint)await checkpoint(operations);
    return ok;
  },
 };
});
vi.mock('../accountCleanupStream',()=>({deleteAccountStreamFiles:vi.fn(async()=>{throw Error('QA_STREAM_FORBIDDEN')})}));
import {prisma} from '@gafus/prisma';
import Redis from 'ioredis';
import {deleteAccountAndPersistCleanup} from '../../../identity-write-server/src/accountDeletionRows';
import {createAccountStorageCleanup} from '../../../core/src/services/accountCleanup/enqueue';
import {insertAccountMediaCleanupSnapshotsTx} from '../../../identity-write-server/src/account-cleanup-records';
import {enqueueGalleryAccountCleanup} from '../../../core/src/services/gallery/accountCleanup';
import {enqueueFeedAccountCleanup} from '@gafus/feed-server/account-cleanup';
import {DUAL_PROVIDER_CLEANUP_MARKER} from '@gafus/cdn-upload';
// Same production snapshot/gallery/feed ports and order, composed here to keep
// the Worker CommonJS typecheck independent of the API's ESM-only exports.
const enqueueAccountStorageCleanup=createAccountStorageCleanup({
 readIntent:()=>({dualGallery:false,dualFeed:false,dualProviderMarker:DUAL_PROVIDER_CLEANUP_MARKER}),
 insertSnapshot:insertAccountMediaCleanupSnapshotsTx,
 enqueueGallery:enqueueGalleryAccountCleanup,
 enqueueFeed:enqueueFeedAccountCleanup,
});
import {processAccountStorageCleanup} from '../accountCleanupWorker';
const env=process.env;
const active=env.GAFUS_QA_FAKE_STORAGE_ACCOUNT_CLEANUP==='1';
const run=env.GAFUS_QA_WORKER_RUN??'';
const cases=['transactional_three_scope_enqueue','fake_storage_sweep_and_cdn_checkpoint',
 'queued_cdn_ack_to_sql_done','idempotent_worker_rerun',
 'foreign_user_and_audit_unchanged','redis_isolated_and_sql_queue_fenced'];
let redis:Redis,dir='',owner='',other='',otherPet='',otherPost='',firstAuditHash='',firstCounter=0;
const stages:any[]=[];
const ownKeys:Record<string,string>={},otherKeys:Record<string,string>={};
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
function guard(){
 const db=new URL(env.DATABASE_URL??'http://invalid');
 const redisUrl=new URL(env.REDIS_URL??'http://invalid');
 const root=realpathSync(resolve(__dirname,'../../../..'));
 const report=env.GAFUS_TEST_REPORT_PATH??'';
 const reportRelative=relative(root,report);
 const reportOwned=report===resolve(root,reportRelative) &&
  /^\.qa\/testing\/qa-[a-f0-9-]+\/tasks\/[a-f0-9]{20}\/attempt-[1-9][0-9]*\/tests\.json$/.test(reportRelative) &&
  realpathSync(dirname(report))===dirname(report);
 if(env.NODE_ENV!=='test'||env.GAFUS_LOCAL_ISOLATED_API!=='1'||
 db.protocol!=='postgresql:'||db.hostname!=='127.0.0.1'||db.username!=='qahttp'||
 db.pathname!==`/archqa_worker_${run}`||!/^[a-f0-9]{12}$/.test(run)||
 redisUrl.protocol!=='redis:'||redisUrl.hostname!=='127.0.0.1'||redisUrl.pathname!=='/0'||
 Number(db.port)<1024||Number(redisUrl.port)<1024||db.port===redisUrl.port||
 !reportOwned)
 throw Error('QA_FAKE_STORAGE_ISOLATED_SQL_REDIS_GUARD_DENIED');
 dir=resolve(env.GAFUS_TEST_REPORT_PATH!,'..');
}
const sql=()=>prisma.accountStorageCleanup.findMany({orderBy:{scope:'asc'}});
async function snapshot(label:string){
 const [jobs,user,audit,counter]=await Promise.all([sql(),
  prisma.user.findUnique({where:{id:other}}),
  prisma.accountDeletionAudit.findMany({where:{userId:owner},select:{id:true,userId:true,role:true,initiatedBy:true,deletedAt:true}}),
  prisma.accountDeletionCounter.findUnique({where:{id:'global'}})]);
 const row={label,queue:jobs.map(j=>({scope:j.scope,status:j.status,attempts:j.attempts,
  keys:j.keys.length,prefixes:j.prefixes,keyCursor:j.keyCursor,operations:j.purgeOperations,
  pendingPurge:j.purgeAfter!==null,scheduledFuture:j.availableAt.getTime()>Date.now()+30000,
  attemptTokenPresent:j.attemptToken!==null,leasePresent:j.leaseUntil!==null,errorCode:j.errorCode})),
  otherIntact:user?.username===`qa_worker_${run}_other`,auditCount:audit.length,
  auditHash:hash(JSON.stringify(audit)),auditInitiatedBy:audit[0]?.initiatedBy??null,
  counter:counter?.totalDeleted??0,
  storage:Object.fromEntries([...fake.objects].map(([scope,store])=>[scope,[...store].sort()])),
  events:fake.events.length,cdnSubmissions:fake.submit,sweeps:fake.sweep,cdnPolls:fake.poll,
  redis:{pong:await redis.ping(),keyCount:await redis.dbsize(),queueBackend:'SQL AccountStorageCleanup, not BullMQ'}};
 stages.push(row);
 writeFileSync(resolve(dir,'worker-progress.json'),JSON.stringify({stages},null,2)+'\n',{mode:0o600});
 return row;
}
(active?describe:describe.skip)('original account cleanup Worker + fake providers, real isolated SQL and Redis',()=>{
 beforeAll(async()=>{
  guard();redis=new Redis(env.REDIS_URL!,{lazyConnect:true,maxRetriesPerRequest:1,connectTimeout:2000});
  await redis.connect();expect(await redis.ping()).toBe('PONG');expect(await redis.dbsize()).toBe(0);
  const dbName=await prisma.$queryRaw<{db:string}[]>`SELECT current_database() AS db`;
  expect(dbName[0]?.db).toBe(`archqa_worker_${run}`);
  expect(await prisma.user.count()).toBe(0);
  expect(await prisma.accountStorageCleanup.count()).toBe(0);
  firstCounter=(await prisma.accountDeletionCounter.findUnique({where:{id:'global'}}))?.totalDeleted??0;
  const u=await prisma.user.create({data:{username:`qa_worker_${run}_owner`,password:'isolated',role:'USER'}});
  const v=await prisma.user.create({data:{username:`qa_worker_${run}_other`,password:'isolated',role:'USER'}});
  owner=u.id;other=v.id;
  await prisma.userProfile.create({data:{userId:owner,avatarUrl:`uploads/users/${owner}/avatar/test.webp`}});
  const pet=await prisma.pet.create({data:{ownerId:owner,name:'Synthetic',type:'DOG',breed:'QA',birthDate:new Date('2023-01-01')}});
  await prisma.petDocument.create({data:{petId:pet.id,ownerId:owner,name:'Synthetic',url:`users/${owner}/pets/file.pdf`,mimeType:'application/pdf',sizeBytes:4}});
  const question=await prisma.question.create({data:{authorId:owner,clientRequestId:randomUUID(),title:'QA',body:'QA',category:'general'}});
  await prisma.questionPhoto.create({data:{ownerId:owner,questionId:question.id,url:`questions/${owner}/qa.webp`,storagePath:`questions/${owner}/qa.webp`}});
  const album=await prisma.galleryAlbum.create({data:{ownerId:owner,name:'QA album'}});
  await prisma.galleryPhoto.create({data:{ownerId:owner,albumId:album.id,reservationExpiresAt:new Date(),thumbKey:`albums/${owner}/${album.id}/photos/photo/thumb.webp`}});
  const post=await prisma.feedPost.create({data:{authorId:owner,clientRequestId:randomUUID()}});
  await prisma.feedMediaAsset.create({data:{ownerId:owner,postId:post.id,kind:'photo',thumbKey:`posts/${owner}/${post.id}/attachments/qa/thumb.webp`}});
  const foreignPet=await prisma.pet.create({data:{ownerId:other,name:'FOREIGN DOG',type:'DOG',breed:'QA',birthDate:new Date('2023-01-01')}});
  otherPet=foreignPet.id;
  const foreignPost=await prisma.feedPost.create({data:{authorId:other,clientRequestId:randomUUID()}});otherPost=foreignPost.id;
  await prisma.feedComment.create({data:{postId:otherPost,authorId:other,text:'FOREIGN COMMENT',clientRequestId:randomUUID()}});
  // Same real transactional delete and production snapshot/gallery/feed ports.
  await deleteAccountAndPersistCleanup(owner,'USER',false,new Date(Date.now()-2000),enqueueAccountStorageCleanup);
  const jobs=await sql();expect(jobs.map(j=>j.scope)).toEqual(['feed','gallery','public']);
  for(const scope of ['feed','gallery','public']){
   const own=scope==='public'?`uploads/users/${owner}/avatar/test.webp`:
     scope==='gallery'?`albums/${owner}/${album.id}/photos/photo/thumb.webp`:
     `posts/${owner}/${post.id}/attachments/qa/thumb.webp`;
   const foreign=scope==='public'?`uploads/users/${other}/avatar/foreign.webp`:
     scope==='gallery'?`albums/${other}/album/foreign/thumb.webp`:
     `posts/${other}/post/attachments/foreign/thumb.webp`;
   ownKeys[scope]=own;otherKeys[scope]=foreign;fake.objects.set(scope,new Set([own,foreign]));
  }
  const s=await snapshot('enqueued');
  expect(s.auditCount).toBe(1);expect(s.counter).toBe(firstCounter+1);
  firstAuditHash=s.auditHash;
 },120000);
 afterAll(async()=>{if(redis)await redis.quit();await prisma.$disconnect()});
 it('transactional_three_scope_enqueue',async()=>{
  const s=stages[0];expect(s.queue.map((j:any)=>j.scope)).toEqual(['feed','gallery','public']);
  expect(s.queue.every((j:any)=>j.status==='pending'&&j.attempts===0&&!j.leasePresent&&!j.attemptTokenPresent)).toBe(true);
  expect(s.otherIntact).toBe(true);expect(s.redis.keyCount).toBe(0);
 });
 it('fake_storage_sweep_and_cdn_checkpoint',async()=>{
  // Production defers storage cleanup; accelerate ONLY our synthetic deleted
  // owner's three SQL queue rows, not any other tenant or global Worker flag.
  const advanced=await prisma.accountStorageCleanup.updateMany({
    where:{ownerId:owner,status:'pending',attempts:0},
    data:{availableAt:new Date(Date.now()-1000)}});
  expect(advanced.count).toBe(3);
  await processAccountStorageCleanup(3);
  const s=await snapshot('fake_sweep_checkpoint');
  expect(s.queue.every((j:any)=>j.status==='pending'&&j.attempts===1&&j.pendingPurge&&j.operations.length===1&&!j.leasePresent&&!j.attemptTokenPresent)).toBe(true);
  expect(fake.submit).toBe(3);expect(fake.sweep).toBe(3);
  for(const scope of ['feed','gallery','public']){
   expect(fake.objects.get(scope)?.has(ownKeys[scope])).toBe(false);
   expect(fake.objects.get(scope)?.has(otherKeys[scope])).toBe(true);
  }
 });
 it('queued_cdn_ack_to_sql_done',async()=>{
  for(const key of fake.purges.keys())fake.purges.set(key,true);
  await prisma.accountStorageCleanup.updateMany({where:{ownerId:owner,status:'pending',purgeAfter:{not:null}},
    data:{purgeAfter:new Date(Date.now()-1000),availableAt:new Date(Date.now()-1000)}});
  await processAccountStorageCleanup(3);
  const s=await snapshot('fake_ack_done');
  expect(s.queue.every((j:any)=>j.status==='done'&&j.attempts===2&&j.keys===0&&!j.leasePresent&&!j.attemptTokenPresent&&j.errorCode===null)).toBe(true);
  expect(fake.submit).toBe(3);expect(fake.poll).toBe(3);
 });
 it('idempotent_worker_rerun',async()=>{
  const before=(await sql()).map(j=>[j.id,j.scope,j.status,j.attempts]);
  const metrics=[fake.events.length,fake.submit,fake.sweep,fake.poll];
  await processAccountStorageCleanup(4);
  const after=(await sql()).map(j=>[j.id,j.scope,j.status,j.attempts]);
  const s=await snapshot('second_drain_noop');
  expect(after).toEqual(before);
  expect([fake.events.length,fake.submit,fake.sweep,fake.poll]).toEqual(metrics);
  expect(s.queue.every((j:any)=>j.status==='done')).toBe(true);
 });
 it('foreign_user_and_audit_unchanged',async()=>{
  const [pet,post,comment,deleted,audit]=await Promise.all([
   prisma.pet.findUnique({where:{id:otherPet}}),prisma.feedPost.findUnique({where:{id:otherPost}}),
   prisma.feedComment.findFirst({where:{postId:otherPost,authorId:other}}),
   prisma.user.findUnique({where:{id:owner}}),
   prisma.accountDeletionAudit.findMany({where:{userId:owner},select:{id:true,userId:true,role:true,initiatedBy:true,deletedAt:true}})
  ]);
  expect(pet?.ownerId).toBe(other);expect(post?.authorId).toBe(other);expect(comment?.text).toBe('FOREIGN COMMENT');
  expect(deleted).toBeNull();expect(audit).toHaveLength(1);expect(hash(JSON.stringify(audit))).toBe(firstAuditHash);
  for(const scope of ['feed','gallery','public'])expect(fake.objects.get(scope)?.has(otherKeys[scope])).toBe(true);
  await snapshot('foreign_and_audit_intact');
 });
 it('redis_isolated_and_sql_queue_fenced',async()=>{
  const s=await snapshot('sql_queue_redis_receipt');
  expect(s.queue.map((j:any)=>[j.scope,j.status])).toEqual([['feed','done'],['gallery','done'],['public','done']]);
  expect(s.redis).toEqual({pong:'PONG',keyCount:0,queueBackend:'SQL AccountStorageCleanup, not BullMQ'});
  expect(stages.map(x=>x.label)).toEqual(['enqueued','fake_sweep_checkpoint','fake_ack_done',
   'second_drain_noop','foreign_and_audit_intact','sql_queue_redis_receipt']);
  const root=resolve(process.cwd(),'../..');
  const paths=['packages/worker/src/accountCleanupWorker.ts',
   'packages/identity-write-server/src/account-cleanup-worker-rows.ts',
   'packages/identity-write-server/src/accountDeletionRows.ts',
   'packages/core/src/services/accountCleanup/enqueue.ts',
   'packages/identity-write-server/src/account-cleanup-records.ts',
   'packages/core/src/services/gallery/accountCleanup.ts',
   'packages/core/src/services/feed/cleanup.ts',
   'packages/worker/src/test/qa-account-cleanup-fake-worker.test.ts'];
  const evidence={schema:1,run,storage:'local-in-memory-fake',
   worker:'original processAccountStorageCleanup and SQL lease repository',
   queueBackend:'PostgreSQL AccountStorageCleanup, not BullMQ',cases,
   db:new URL(env.DATABASE_URL!).pathname.slice(1),
   postgresPort:Number(new URL(env.DATABASE_URL!).port),redisPort:Number(new URL(env.REDIS_URL!).port),
   sourceHashes:Object.fromEntries(paths.map(p=>[p,hash(readFileSync(resolve(root,p),'utf8'))])),
   phases:stages,events:fake.events,ownKeys,otherKeys,firstAuditHash,
   ownerHash:hash(owner),foreignHash:hash(other),externalStorageTouched:false,externalCdnTouched:false};
  writeFileSync(resolve(dir,'worker-fake-storage.json'),JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
 });
});
