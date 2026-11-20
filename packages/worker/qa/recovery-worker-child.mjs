/** Private real BullMQ worker child. Controller owns this PID; never production Worker bootstrap. */
import {openSync,writeSync,fsyncSync,closeSync} from 'node:fs';
import {Worker} from 'bullmq';
import {prisma} from '@gafus/prisma';
import {createMediaCdnPurgeRepository} from '@gafus/media-server/purge-repository';
import {processOneMediaCdnPurge} from '../dist/worker/src/media-cdn-purge-worker.js';
const {GAFUS_RECOVERY_CHILD_TOKEN:token,GAFUS_RECOVERY_QUEUE:queueName,GAFUS_RECOVERY_LEDGER:ledger,
  GAFUS_RECOVERY_MODE:mode,GAFUS_RECOVERY_REDIS_PORT:portString}=process.env;
const port=Number(portString);
const db=new URL(process.env.DATABASE_URL??'http://invalid');
if(!token||token.length<24||!/^gafus-qa-recover-[a-f0-9]{16}$/.test(queueName??'')||
  !['hold-redis','hold-crash','resume-checkpoint'].includes(mode) ||
  !ledger?.startsWith('/tmp/gafus-qa-worker-recovery.')||!Number.isInteger(port)||port<1024||
  db.hostname!=='127.0.0.1'||!/^archqa_worker_recovery_[a-f0-9]{12}$/.test(db.pathname.slice(1))||
  process.env.GAFUS_RECOVERY_EXPLICIT_QA!=='1')throw Error('RECOVERY_CHILD_NON_ISOLATED_DENIED');
const send=(type,detail={})=>process.send?.({type,token,...detail});
let resume;
process.on('message',msg=>{
  if(msg?.token!==token)return;
  if(msg.type==='RESUME'&&resume){const go=resume;resume=null;go();}
  if(msg.type==='SHUTDOWN')void shutdown();
});
const waitResume=()=>new Promise(resolve=>{resume=resolve});
let activeJobId=null;
const repo=createMediaCdnPurgeRepository();
const operation='beget:synthetic-operation-once';
const deps={...repo,
  begin:async(_scope,_paths,previous,checkpoint)=>{
    if(previous.length){
      if(previous.length!==1||previous[0]!==operation)throw Error('RECOVERY_INVALID_CHECKPOINT');
      send('REUSED_CHECKPOINT',{id:activeJobId,operation});
      if(mode==='resume-checkpoint')await waitResume(); // prove stale SQL fencing during live new lease
      return previous;
    }
    // Real durable synthetic external-submit ledger; fsync precedes SQL checkpoint.
    const fd=openSync(ledger,'a',0o600);
    try{writeSync(fd,JSON.stringify({type:'SUBMITTED',id:activeJobId,operation})+'\n');fsyncSync(fd)}
    finally{closeSync(fd)}
    await checkpoint([operation]);
    send('CHECKPOINTED',{id:activeJobId,operation});
    if(mode!=='resume-checkpoint')await waitResume();
    return [operation];
  },
  done:async value=>value===operation,
};
const worker=new Worker(queueName,async job=>{
  if(job.name!=='purge' || typeof job.data?.id!=='string')throw Error('RECOVERY_UNKNOWN_JOB');
  activeJobId=job.data.id;
  const result=await processOneMediaCdnPurge(deps);
  if(result!=='done')throw Error('RECOVERY_UNEXPECTED_PG_OUTCOME_'+result);
  return {result,id:activeJobId};
},{connection:{host:'127.0.0.1',port,maxRetriesPerRequest:null},lockDuration:4000,
  stalledInterval:1000,maxStalledCount:2,concurrency:1});
worker.on('error',error=>send('WORKER_CONNECTION_ERROR',{code:error?.code??'UNKNOWN'}));
worker.on('failed',(job,error)=>send('WORKER_JOB_FAILED',{id:job?.id,reason:String(error?.message).slice(0,120)}));
let shuttingDown=false;
async function shutdown(){
  if(shuttingDown)return;shuttingDown=true;
  if(resume){resume();resume=null}
  try{await worker.close();await prisma.$disconnect();send('STOPPED');process.exit(0)}
  catch{process.exit(2)}
}
process.on('SIGTERM',()=>void shutdown());
await worker.waitUntilReady();
send('READY',{pid:process.pid,mode});
