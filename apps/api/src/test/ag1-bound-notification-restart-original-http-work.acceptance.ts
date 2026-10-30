/** Original registered HTTP/JWT across two real Hono processes. OWN synthetic WORK only. */
import {randomBytes} from 'node:crypto';
import {openSync,writeFileSync,readFileSync,closeSync,unlinkSync,realpathSync} from 'node:fs';
import bcrypt from 'bcryptjs';
import {prisma} from '@gafus/prisma';
import {pushQueue,connection} from '@gafus/queues';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
const lease=ROOT+'/.local-pg-scratch/ag1-outbox-http-lease-20261025.private.json';
type S={ownerId:string;ownerUsername:string;ownerPassword:string;authorId:string;courseId:string;courseType:string;dayId:string;dayLinkId:string;stepId:string;linkId:string;usersBefore:number};
function guard(b:unknown,e:string):asserts b{if(!b)throw Error('OUTBOX_HTTP_'+e);}
const phase=process.argv[2];
const state=()=>JSON.parse(readFileSync(lease,'utf8')) as S;
const pass=(s:string)=>console.warn('AG1_ORIGINAL_OUTBOX_RESTART_'+s+'=PASS');
async function http(path:string,method='GET',token?:string,body?:unknown){const r=await fetch('http://127.0.0.1:3001/api/v1'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});return{status:r.status,data:await r.json() as Record<string,unknown>};}
async function login(s:S){const l=await http('/auth/login','POST',undefined,{username:s.ownerUsername,password:s.ownerPassword});guard(l.status===200,'STOCK_JWT_LOGIN200');const d=l.data.data as Record<string,unknown>;guard(typeof d?.accessToken==='string','JWT_FROM_HONO');return d.accessToken as string;}
async function notifications(s:S){return prisma.stepNotification.findMany({where:{userId:s.ownerId,dayOnCourseId:s.dayLinkId,stepOnDayId:s.linkId},select:{id:true,jobId:true,paused:true,sent:true,originalStepId:true}});}
async function main(){
 guard(phase==='prepare'||phase==='fault-http'||phase==='readback'||phase==='recovered'||phase==='cleanup','KNOWN_PHASE');
 guard(process.env.AG1_OUTBOX_ORIGINAL_HTTP_WORK==='1','EXPLICIT_OPTIN');
 guard(realpathSync(process.cwd())===ROOT+'/apps/api'&&realpathSync(ROOT)===ROOT,'EXACT_ROOT');
 const u=new URL(process.env.DATABASE_URL??'');guard(u.hostname==='127.0.0.1'&&u.port==='55921'&&u.username==='gafus_refactor_local_real'&&u.pathname==='/gafus_refactor_real_work_20261024','RESTRICTED_WORK');
 guard(process.env.NODE_ENV==='development'&&process.env.REDIS_URL==='redis://127.0.0.1:55927/1','LOCAL_PROJECT_ONLY');
 if(phase==='prepare'){
  const nick='ag1_outbox_http_'+randomBytes(5).toString('hex');
  const passw=randomBytes(24).toString('base64url');
  const before=await prisma.user.count();guard(before===2570,'BASELINE_2570');
  const s:Partial<S>={usersBefore:before};
  try{
   const trainer=await prisma.user.create({data:{username:nick+'_trainer',password:await bcrypt.hash(passw,10),registrationPending:false,role:'TRAINER'}});s.authorId=trainer.id;
   const learner=await prisma.user.create({data:{username:nick+'_learner',password:await bcrypt.hash(passw,10),registrationPending:false,role:'USER'}});s.ownerId=learner.id;s.ownerUsername=learner.username;s.ownerPassword=passw;
   const course=await prisma.course.create({data:{name:'AG1 original Hono outbox restart fixture',type:nick,trainingLevel:'BEGINNER',duration:'1',logoImg:'',authorId:trainer.id,isPrivate:true}});s.courseId=course.id;s.courseType=course.type;
   const day=await prisma.trainingDay.create({data:{title:'AG1 outbox restart own day',authorId:trainer.id}});s.dayId=day.id;
   const dl=await prisma.dayOnCourse.create({data:{courseId:course.id,dayId:day.id,order:1}});s.dayLinkId=dl.id;
   const step=await prisma.step.create({data:{title:'AG1 outbox restart actual step',authorId:trainer.id,type:'TRAINING',durationSec:14400}});s.stepId=step.id;
   const stepLink=await prisma.stepOnDay.create({data:{dayId:day.id,stepId:step.id,order:0}});s.linkId=stepLink.id;
   await prisma.courseAccess.create({data:{courseId:course.id,userId:learner.id}});
   await prisma.pushSubscription.create({data:{userId:learner.id,endpoint:`https://${nick}.invalid/no-delivery`,keys:{p256dh:'synthetic',auth:'synthetic'}}});
   const fd=openSync(lease,'wx',0o600);try{writeFileSync(fd,JSON.stringify(s));}finally{closeSync(fd);}
   pass('OWN_PRIVATE_SYNTHETIC_AUTH_USER_COURSE_SUBSCRIPTION_LEASE_PREPARED');
  }catch(e){console.error('AG1_PREPARE_INCOMPLETE_REVIEW_OWN_IDS_ONLY');throw e;}
  return;
 }
 const s=state();guard(s.ownerUsername.startsWith('ag1_outbox_http_')&&s.ownerUsername.endsWith('_learner'),'EXACT_SYNTHETIC_OWNER');
 if(phase==='fault-http'){
  const token=await login(s);
  const v=await http('/training/day?courseType='+encodeURIComponent(s.courseType)+'&dayOnCourseId='+s.dayLinkId+'&createIfMissing=false','GET',token);
  guard(v.status===200,'REAL_ORIGINAL_DAY_GET');
  const start=await http('/training/step/start','POST',token,{courseId:s.courseId,dayOnCourseId:s.dayLinkId,stepIndex:0,durationSec:14400,expectedStepOnDayId:s.linkId,expectedStepId:s.stepId});
  guard(start.status===503&&start.data.code==='LOCAL_OUTBOX_FAULT_AFTER_SQL_COMMIT','REAL_FAULT_AFTER_SQL_BEFORE_ENQUEUE');
  pass('STOCK_JWT_ORIGINAL_HONO_REAL_POST503_AFTER_DURABLE_SQL_COMMIT');
 }
 if(phase==='fault-http'||phase==='readback'){
  const ut=await prisma.userTraining.findUnique({where:{userId_dayOnCourseId:{userId:s.ownerId,dayOnCourseId:s.dayLinkId}},select:{status:true,steps:{select:{status:true,remainingSec:true,stepOnDayId:true}}}});
  guard(ut?.steps.length===1&&ut.steps[0].status==='IN_PROGRESS'&&ut.steps[0].stepOnDayId===s.linkId,'DURABLE_USERSTEP_AFTER_HTTP');
  const ns=await notifications(s);guard(ns.length===1&&ns[0].jobId===null&&ns[0].originalStepId===s.stepId,'ATOMIC_INTENT_NO_JOB_SQL');
  guard(!(await pushQueue.getJob('bound-'+ns[0].id)),'NO_REDIS_BEFORE_RESTART');
  pass('SQL_ATOMIC_INTENT_PERSISTED_WITH_USERSTEP_AND_NO_REDIS_JOB');
 }
 if(phase==='recovered'){
  const ns=await notifications(s);guard(ns.length===1&&ns[0].jobId==='bound-'+ns[0].id,'RESTART_SCOPED_AUTOMATIC_SWEEP_LINKED_SQL');
  const job=await pushQueue.getJob(ns[0].jobId!);guard(job&&(await job.getState())==='delayed'&&job.data.notificationId===ns[0].id,'ONE_TRUE_OWN_REDIS_JOB');
  pass('SEPARATE_NEW_HONO_PROCESS_STARTUP_RECOVERED_ONE_SQL_AND_ONE_REDIS');
  const token=await login(s);
  const completed=await http('/training/step/complete/practice','POST',token,{courseId:s.courseId,dayOnCourseId:s.dayLinkId,stepIndex:0,expectedStepOnDayId:s.linkId,expectedStepId:s.stepId});
  guard(completed.status===200,'ORIGINAL_COMPLETE200');
  for(let i=0;i<35;i++){if((await notifications(s)).length===0&&!(await pushQueue.getJob('bound-'+ns[0].id)))break;await new Promise(r=>setTimeout(r,100));}
  guard((await notifications(s)).length===0&&!(await pushQueue.getJob('bound-'+ns[0].id)),'COMPLETED_CLEARED_EXACT_OWN_NOTIFICATION_AND_REDIS');
  const ut=await prisma.userTraining.findUnique({where:{userId_dayOnCourseId:{userId:s.ownerId,dayOnCourseId:s.dayLinkId}},select:{status:true,steps:{select:{status:true}}}});
  guard(ut?.status==='COMPLETED'&&ut.steps.length===1&&ut.steps[0].status==='COMPLETED','ONE_DURABLE_COMPLETED_STEP');
  pass('ORIGINAL_HONO_COMPLETE_CLEARS_ONLY_OWN_SQL_REDIS_JOB_NO_DUPLICATES');
 }
 if(phase==='cleanup'){
  const ns=await notifications(s);for(const x of ns){for(const id of [x.jobId,'bound-'+x.id])if(id){const j=await pushQueue.getJob(id);if(j)await j.remove();}}
  await prisma.stepNotification.deleteMany({where:{userId:s.ownerId}});await prisma.pushSubscription.deleteMany({where:{userId:s.ownerId}});
  await prisma.userTraining.deleteMany({where:{dayOnCourseId:s.dayLinkId}});await prisma.courseAccess.deleteMany({where:{courseId:s.courseId}});await prisma.dayOnCourse.deleteMany({where:{courseId:s.courseId}});
  await prisma.stepOnDay.deleteMany({where:{dayId:s.dayId}});await prisma.step.deleteMany({where:{id:s.stepId,authorId:s.authorId}});await prisma.trainingDay.deleteMany({where:{id:s.dayId,authorId:s.authorId}});await prisma.course.deleteMany({where:{id:s.courseId,authorId:s.authorId}});
  for(const id of [s.ownerId,s.authorId]){const u=await prisma.user.findUnique({where:{id},select:{username:true}});if(u?.username.startsWith('ag1_outbox_http_'))await prisma.user.delete({where:{id}});}
  guard(await prisma.user.count()===s.usersBefore,'BASELINE_USERS_RESTORED');unlinkSync(lease);
  pass('OWN_EXACT_FIXTURE_SQL_AND_REDIS_CLEANED_TO_PREVIOUS_USERS');
 }
}
void main().catch(e=>{process.exitCode=1;console.error('AG1_ORIGINAL_OUTBOX_FAIL_PHASE='+phase+' CAUSE='+(e instanceof Error?e.message:'UNKNOWN'));}).finally(async()=>{await prisma.$disconnect();await pushQueue.close();connection.disconnect();});
