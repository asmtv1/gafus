/** Crash fault real WORK PostgreSQL + isolated BullMQ, patched ORIGINAL Core source.
 * Does NOT invoke shared packaged Hono (AG2 currently active). NO push worker.
 */
import {randomBytes} from 'node:crypto';
import {realpathSync} from 'node:fs';
import {prisma} from '@gafus/prisma';
import {pushQueue,connection} from '@gafus/queues';
import {updateStepAndDay} from '../../../../packages/core/src/services/training/trainingService';
import {reconcileBoundNotificationIntentById,reconcilePendingBoundNotificationIntents,pauseBoundStepNotification,resumeBoundStepNotification,resetBoundStepNotification} from '../../../../packages/core/src/services/notifications/stepNotificationService';
const root='/Users/asmtv1/Desktop/gafus-refactor';
const prefix='ag1_notify_crash_'+randomBytes(6).toString('hex');
let phase='PRECHECK';
const own:{owner?:string,author?:string,course?:string,day?:string,dayLink?:string,steps:string[],links:string[],notifIds:Set<string>,jobs:Set<string>}={steps:[],links:[],notifIds:new Set(),jobs:new Set()};
function ck(x:unknown,k:string):asserts x{if(!x)throw Error('BOUND_OUTBOX_'+k);}
function pass(k:string){console.warn('AG1_BOUNDED_OUTBOX_REAL_WORK_'+k+'=PASS');}
const jobId=(id:string)=>`bound-${id}`;
async function notices(id:string){return prisma.stepNotification.findMany({where:{userId:own.owner,stepOnDayId:id},select:{id:true,jobId:true,paused:true,remainingSec:true,originalStepId:true,updatedAt:true}});}
async function cleanup(){
 for(const id of own.jobs){try{const job=await pushQueue.getJob(id);if(job)await job.remove();}catch(e){console.error('AG1_OWN_JOB_CLEANUP_FAILED_'+(e instanceof Error?e.name:'UNKNOWN'));process.exitCode=1;}}
 if(own.owner){await prisma.stepNotification.deleteMany({where:{userId:own.owner}});await prisma.pushSubscription.deleteMany({where:{userId:own.owner}});}
 if(own.dayLink)await prisma.userTraining.deleteMany({where:{dayOnCourseId:own.dayLink}});
 if(own.course){await prisma.courseAccess.deleteMany({where:{courseId:own.course}});await prisma.dayOnCourse.deleteMany({where:{courseId:own.course}});}
 if(own.day)await prisma.stepOnDay.deleteMany({where:{dayId:own.day}});
 for(const id of own.steps)if(own.author)await prisma.step.deleteMany({where:{id,authorId:own.author}});
 if(own.day)await prisma.trainingDay.deleteMany({where:{id:own.day}});
 if(own.course)await prisma.course.deleteMany({where:{id:own.course}});
 for(const id of [own.owner,own.author])if(id){const u=await prisma.user.findUnique({where:{id},select:{username:true}});if(u?.username.startsWith(prefix))await prisma.user.delete({where:{id}});}
}
async function main(){
 ck(process.env.AG1_BOUND_OUTBOX_FAULT_WORK==='1','EXPLICIT_OPTIN');
 ck(realpathSync(root)===root&&realpathSync(process.cwd())===root+'/apps/api','EXACT_ROOT');
 const u=new URL(process.env.DATABASE_URL??'');
 ck(u.hostname==='127.0.0.1'&&u.port==='55921'&&u.username==='gafus_refactor_local_real'&&u.pathname==='/gafus_refactor_real_work_20261024','ONLY_RESTRICTED_WORK');
 ck(process.env.NODE_ENV==='development'&&process.env.GAFUS_LOCAL_ISOLATED_API==='1'&&process.env.REDIS_URL==='redis://127.0.0.1:55927/1','NO_EXTERNAL_REDIS');
 const initialUsers=await prisma.user.count();
 const a=await prisma.user.create({data:{username:prefix+'_author',password:'synthetic-not-login',role:'TRAINER',registrationPending:false}});own.author=a.id;
 const owner=await prisma.user.create({data:{username:prefix+'_learner',password:'synthetic-not-login',role:'USER',registrationPending:false}});own.owner=owner.id;
 try{
  phase='GRAPH';
  const course=await prisma.course.create({data:{name:'AG1 isolated crash outbox',type:prefix,trainingLevel:'BEGINNER',duration:'1',logoImg:'',authorId:a.id,isPrivate:true}});own.course=course.id;
  const day=await prisma.trainingDay.create({data:{title:'AG1 durable outbox test day',authorId:a.id}});own.day=day.id;
  const dc=await prisma.dayOnCourse.create({data:{courseId:course.id,dayId:day.id,order:1}});own.dayLink=dc.id;
  await prisma.courseAccess.create({data:{courseId:course.id,userId:owner.id}});
  for(let i=0;i<4;i++){
   const step=await prisma.step.create({data:{title:'AG1 outbox owned step'+i,authorId:a.id,type:'TRAINING',durationSec:14400}});own.steps.push(step.id);
   const link=await prisma.stepOnDay.create({data:{dayId:day.id,stepId:step.id,order:i}});own.links.push(link.id);
  }
  await prisma.pushSubscription.create({data:{userId:owner.id,endpoint:`https://${prefix}.invalid/no-delivery`,keys:{p256dh:'synthetic',auth:'synthetic'}}});
  pass('OWN_USER_FOUR_STABLE_STEPONDAY_LINKS_UNDELIVERABLE_SUBSCRIPTION');
  const binding=(i:number)=>({expectedCourseId:course.id,expectedStepOnDayId:own.links[i],expectedStepId:own.steps[i]});
  const bound=(i:number)=>({dayOnCourseId:dc.id,stepOnDayId:own.links[i],stepId:own.steps[i]});
  const start=(i:number)=>updateStepAndDay(owner.id,dc.id,i,{type:'start',remainingSec:14400},binding(i));
  const finish=(i:number)=>updateStepAndDay(owner.id,dc.id,i,{type:'complete'},binding(i));
  phase='AFTER_SQL_COMMIT_BEFORE_REDIS';
  const first=await start(0);ck(first.stepJustStarted,'FIRST_SOURCE_CORE_ATOMIC_START');
  const nA=await notices(own.links[0]);ck(nA.length===1&&!nA[0].jobId,'NOTIFICATION_DURABLY_COMMITTED_BUT_QUEUE_NOT_ADDED');
  own.notifIds.add(nA[0].id);own.jobs.add(jobId(nA[0].id));
  ck((await pushQueue.getJob(jobId(nA[0].id)))===undefined,'SIMULATED_PROCESS_DEATH_BEFORE_QUEUE_NO_JOB');
  pass('FAULT_AFTER_CORE_COMMIT_BEFORE_QUEUE_PERSISTED_INTENT_AND_ZERO_QUEUE');
  phase='RECONCILER_RACE';
  const reconciled=await Promise.all([
   reconcileBoundNotificationIntentById(nA[0].id),
   reconcileBoundNotificationIntentById(nA[0].id),
  ]);
  console.warn('AG1_BOUND_OUTBOX_RECONCILER_RACE_STATES='+reconciled.map(x=>x.queued?'QUEUED':x.reason).join(','));
  ck(reconciled.filter(x=>x.queued).length===1,'DOUBLE_RECONCILER_ONE_CLAIM');
  const readA=await notices(own.links[0]);
  ck(readA.length===1&&readA[0].jobId===jobId(nA[0].id),'SQL_JOB_ID_DETERMINISTIC');
  const queuedA=await pushQueue.getJob(jobId(nA[0].id));
  ck(queuedA&&(await queuedA.getState())==='delayed'&&queuedA.data.notificationId===nA[0].id,'ONE_TRUE_REDIS_BULLMQ_JOB');
  pass('TWO_SIMULTANEOUS_RECONCILERS_SQL_CAS_ONE_JOB_ID_ONE_DELAYED_QUEUE');
  phase='CRASH_AFTER_REDIS_ADD_BEFORE_SQL_LINK';
  await start(1);
  const nB=await notices(own.links[1]);ck(nB.length===1&&!nB[0].jobId,'B_NEW_DURABLE_INTENT');
  own.notifIds.add(nB[0].id);own.jobs.add(jobId(nB[0].id));
  const manuallyQueued=await pushQueue.add('push',{notificationId:nB[0].id},{jobId:jobId(nB[0].id),delay:14400*1000,removeOnComplete:true,removeOnFail:false});
  ck(manuallyQueued.id===jobId(nB[0].id)&&(await notices(own.links[1]))[0].jobId===null,'SIMULATED_REDIS_ADDED_BEFORE_DB_ACK');
  const resumedB=await reconcileBoundNotificationIntentById(nB[0].id);
  ck(resumedB.queued&&(await notices(own.links[1]))[0].jobId===jobId(nB[0].id),'RETRY_WITH_SAME_DETERMINISTIC_JOB_ID');
  ck((await pushQueue.getJob(jobId(nB[0].id)))!==undefined,'ONE_OWN_B_JOB_AFTER_RECOVERY');
  pass('FAULT_AFTER_REDIS_BEFORE_SQL_ACK_RECONCILE_ONE_STABLE_JOB');
  phase='PAUSE_BEFORE_QUEUE';
  await start(2);
  const nC=await notices(own.links[2]);ck(nC.length===1&&!nC[0].jobId,'C_DURABLE_INTENT');
  own.notifIds.add(nC[0].id);own.jobs.add(jobId(nC[0].id));
  await updateStepAndDay(owner.id,dc.id,2,{type:'pause',remainingSec:6500},binding(2));
  await pauseBoundStepNotification(owner.id,bound(2),6500);
  const blocked=await reconcileBoundNotificationIntentById(nC[0].id);
  ck(!blocked.queued&&(await pushQueue.getJob(jobId(nC[0].id)))===undefined,'PAUSED_STEP_NOT_QUEUED');
  ck((await notices(own.links[2]))[0].paused,'PAUSED_PENDING_INTENT_FENCED');
  await updateStepAndDay(owner.id,dc.id,2,{type:'resume'},binding(2));
  await resumeBoundStepNotification(owner.id,bound(2));
  const resumedC=await notices(own.links[2]);
  ck(resumedC.length===1&&resumedC[0].jobId===jobId(nC[0].id)&&!resumedC[0].paused,'C_RESUME_SQL_LINK');
  ck((await pushQueue.getJob(jobId(nC[0].id)))!==undefined,'C_RESUME_OWN_DELAYED_JOB');
  pass('PAUSE_BEFORE_ENQUEUE_SKIPS_QUEUE_RESUME_REENQUEUES_STABLE_ID');
  phase='COMPLETE_BEFORE_RECONCILER';
  await start(3);
  const nD=await notices(own.links[3]);ck(nD.length===1&&!nD[0].jobId,'D_PENDING');
  own.notifIds.add(nD[0].id);own.jobs.add(jobId(nD[0].id));
  await finish(3);
  const staleD=await reconcileBoundNotificationIntentById(nD[0].id);
  ck(!staleD.queued&&(await notices(own.links[3])).length===0,'COMPLETED_PENDING_ROW_FENCED_AND_DELETED');
  ck((await pushQueue.getJob(jobId(nD[0].id)))===undefined,'COMPLETE_BEFORE_RECONCILE_NO_REDIS_JOB');
  pass('COMPLETE_AFTER_COMMIT_BEFORE_QUEUE_RECONCILE_STALE_INTENT_CANCELLED');
  phase='RETRY_BACKOFF';
  await resetBoundStepNotification(owner.id,bound(1));
  ck((await notices(own.links[1])).length===0&&(await pushQueue.getJob(jobId(nB[0].id)))===undefined,'RESET_EXACT_B_REMOVAL');
  const invalid=await reconcileBoundNotificationIntentById(nB[0].id);
  ck(!invalid.queued,'CANCELLED_B_CANNOT_RECOVER');
  const scan=await reconcilePendingBoundNotificationIntents({userId:owner.id,limit:10,retryDelayMs:30_000});
  ck(scan.queued===0,'BACKOFF_SCAN_DOES_NOT_CREATE_OTHER_JOB');
  pass('CANCELLED_GENERATION_NOT_REENQUEUED_BOUNDED_SCAN_BACKOFF_SAFE');
  phase='EXACT_OWN_CLEANUP';
  await cleanup();
  ck(await prisma.user.count()===initialUsers,'ORIGINAL_USER_COUNT_PRESERVED');
  ck(await prisma.stepNotification.count({where:{userId:owner.id}})===0,'NO_OWN_STEP_NOTIFICATION');
  for(const id of own.jobs)ck((await pushQueue.getJob(id))===undefined,'ALL_EXACT_OWN_BULLMQ_JOBS_REMOVED');
  pass('OWN_SQL_AND_ALL_EXACT_REDIS_JOBS_CLEANED_NO_FOREIGN_DRAIN');
  pass('ORIGINAL_CORE_SOURCE_DURABLE_OUTBOX_CRASH_FAULT_REAL_WORK_REDIS_ACCEPTED');
 }finally{await cleanup();}
}
void main().catch(e=>{process.exitCode=1;console.error('AG1_BOUND_OUTBOX_FAIL_PHASE='+phase+';CAUSE='+(e instanceof Error&&e.message.startsWith('BOUND_OUTBOX_')?e.message:(e instanceof Error?e.name:'UNKNOWN')));}).finally(async()=>{await prisma.$disconnect();await pushQueue.close();connection.disconnect();});
