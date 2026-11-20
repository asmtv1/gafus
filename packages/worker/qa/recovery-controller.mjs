/**
 * Explicit opt-in QA harness. Only subprocesses spawned in this invocation are
 * signaled; only this run's loopback Redis, PostgreSQL and queue are accessed.
 * This is a BullMQ <-> real media SQL outbox QA bridge, NOT production wiring.
 */
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn,fork} from 'node:child_process';
import {existsSync,openSync,closeSync,readFileSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {createConnection} from 'node:net';
import {setTimeout as pause} from 'node:timers/promises';
import {Queue} from 'bullmq';
import {prisma} from '@gafus/prisma';
import {createMediaCdnPurgeRepository} from '@gafus/media-server/purge-repository';
const directory=process.env.GAFUS_RECOVERY_DIR??'';
const report=process.env.GAFUS_TEST_REPORT_PATH??'';
const pgURL=new URL(process.env.DATABASE_URL??'http://invalid');
const port=Number(process.env.GAFUS_RECOVERY_REDIS_PORT);
if(process.env.GAFUS_RECOVERY_EXPLICIT_QA!=='1'||process.env.NODE_ENV!=='test'||
  !/^\/tmp\/gafus-qa-worker-recovery\.[a-zA-Z0-9]+$/.test(directory)||
  !report.startsWith(process.cwd().replace(/\/packages\/worker$/,'')+'/.qa/testing/qa-')||
  !report.endsWith('/tests.json')||report.includes('..')||
  pgURL.protocol!=='postgresql:'||pgURL.hostname!=='127.0.0.1'||
  pgURL.username!=='qarecovery'||!/^archqa_worker_recovery_[a-f0-9]{12}$/.test(pgURL.pathname.slice(1))||
  !Number.isInteger(port)||port<1024||port>65535)
  throw Error('WORKER_RECOVERY_NON_ISOLATED_DENIED');
const suffix=randomBytes(8).toString('hex');
const queueName='gafus-qa-recover-'+suffix;
const token=randomBytes(24).toString('hex');
const ledger=join(directory,'synthetic-submissions.jsonl');
const redisLog=join(directory,'redis.log');
const workerLog=join(directory,'worker.log');
const cases=[];
const ownedChildren=new Set();
const ownedPids=[];
const audit=[];
let redis=null,queue=null;
let interrupting=false;
async function stopOnSignal(signal){
  if(interrupting)return;
  interrupting=true;
  console.error('RECOVERY_QA_INTERRUPTED_CLEANING_OWNED_CHILDREN',signal);
  const children=[...ownedChildren];
  // These references exist ONLY because this controller invoked spawn/fork.
  for(const child of children){
    if(child.pid && child.exitCode===null && child.signalCode===null)child.kill('SIGTERM');
  }
  await Promise.allSettled(children.map(child=>waitExit(child,1900)));
  for(const child of children){
    if(child.pid && child.exitCode===null && child.signalCode===null)child.kill('SIGKILL');
  }
  process.exit(signal==='SIGINT'?130:143);
}
process.on('SIGTERM',()=>{void stopOnSignal('SIGTERM')});
process.on('SIGINT',()=>{void stopOnSignal('SIGINT')});
let redisStops=0,redisStarts=0,redisUnavailable=false,redisReconnected=false;
let sigkills=0,staleTokenRejected=false,stalledReclaim=false,checkpointReused=false,wasCheckpointBeforeKill=false;
let completed1=false,completed2=false,duplicateEnqueueSuppressed=false;
const checkpoint='beget:synthetic-operation-once';
const messages=new Map();
function note(type,data={}){audit.push({type,...data})}
async function eventually(fn,description,ms=30000){
  const end=Date.now()+ms;let last;
  while(Date.now()<end){try{const value=await fn();if(value)return value}catch(e){last=e}await pause(125)}
  throw Error('RECOVERY_TIMEOUT_'+description+(last?':'+String(last.message).slice(0,150):''));
}
function ping(){return new Promise(resolve=>{
  const socket=createConnection({host:'127.0.0.1',port});let done=false;
  const finish=(value)=>{if(done)return;done=true;socket.destroy();resolve(value)};
  socket.setTimeout(400,()=>finish(false));
  socket.once('connect',()=>socket.write('*1\r\n$4\r\nPING\r\n'));
  socket.on('data',data=>finish(String(data).startsWith('+PONG')));
  socket.once('error',()=>finish(false));
  socket.once('close',()=>finish(false));
})}
function waitExit(proc,ms=4000){return new Promise((res,rej)=>{
  if(proc.exitCode!==null||proc.signalCode!==null)return res({code:proc.exitCode,signal:proc.signalCode});
  const timer=setTimeout(()=>rej(Error('RECOVERY_OWNED_PROCESS_NOT_EXITED')),ms);
  proc.once('exit',(code,signal)=>{clearTimeout(timer);res({code,signal})});
})}
async function startRedis(){
  assert.equal(redis,null);
  const out=openSync(redisLog,'a',0o600);
  try{redis=spawn('redis-server',['--bind','127.0.0.1','--port',String(port),
    '--protected-mode','yes','--save','','--appendonly','yes','--appendfsync','always',
    '--dir',directory,'--daemonize','no'],{stdio:['ignore',out,out],env:{PATH:process.env.PATH}})}
  finally{closeSync(out)}
  const instance=redis;ownedChildren.add(instance);ownedPids.push({role:'redis',pid:instance.pid});
  await eventually(async()=>{
    if(instance.exitCode!==null)throw Error('RECOVERY_REDIS_SPAWN_EXITED');
    return await ping();
  },'REDIS_BOOT',6000);
  redisStarts++;note('REDIS_READY');
}
async function stopRedis(){
  const instance=redis;assert.ok(instance?.pid);
  assert.equal(instance.kill('SIGTERM'),true);
  const exit=await waitExit(instance,5000);
  assert.ok(exit.code!==null||exit.signal!==null);
  ownedChildren.delete(instance);redis=null;redisStops++;
  await eventually(async()=>!(await ping()),'REDIS_STOP',3000);
  redisUnavailable=true;note('REDIS_DISCONNECTED');
}
function startWorker(mode){
  const out=openSync(workerLog,'a',0o600);
  let child;
  try{child=fork(join(import.meta.dirname,'recovery-worker-child.mjs'),[],{
    cwd:resolve(import.meta.dirname,'..'),
    env:{...process.env,GAFUS_RECOVERY_CHILD_TOKEN:token,GAFUS_RECOVERY_QUEUE:queueName,
      GAFUS_RECOVERY_LEDGER:ledger,GAFUS_RECOVERY_MODE:mode,GAFUS_RECOVERY_REDIS_PORT:String(port)},
    stdio:['ignore',out,out,'ipc'],
  })}finally{closeSync(out)}
  ownedChildren.add(child);ownedPids.push({role:'worker-'+mode,pid:child.pid});
  const history=[];const waiters=[];
  child.on('exit',(code,signal)=>{
    for(const w of [...waiters]){clearTimeout(w.timer);w.reject(Error('RECOVERY_CHILD_EXIT '+code+' '+signal));}
    waiters.length=0;
  });
  child.on('message',msg=>{
    if(msg?.token!==token)return;
    history.push(msg);note(msg.type,{mode});
    for(const w of [...waiters])if(w.type===msg.type){clearTimeout(w.timer);waiters.splice(waiters.indexOf(w),1);w.resolve(msg)}
  });
  const wait=(type,ms=18000)=>new Promise((resolve,reject)=>{
    const prior=history.find(x=>x.type===type);
    if(prior)return resolve(prior);
    if(child.exitCode!==null||child.signalCode!==null)return reject(Error('RECOVERY_WORKER_EXIT_BEFORE_'+type));
    const w={type,resolve,reject,timer:null};
    w.timer=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(Error('RECOVERY_CHILD_EVENT_TIMEOUT_'+type))},ms);
    waiters.push(w);
  });
  return {child,wait,history};
}
async function stopWorker(value){
  const child=value.child;
  if(child.exitCode!==null||child.signalCode!==null){ownedChildren.delete(child);return}
  if(child.connected)child.send({type:'SHUTDOWN',token});
  try{await waitExit(child,5000)}catch{
    // Only this specifically held child, never a process found by name or PID search.
    if(child.pid && child.exitCode===null && child.signalCode===null)child.kill('SIGTERM');
    await waitExit(child,2500);
  }
  ownedChildren.delete(child);
}
function readLedger(){
  return existsSync(ledger)?readFileSync(ledger,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
}
const queueConnection={host:'127.0.0.1',port,maxRetriesPerRequest:null};
async function createIntent(){
  const id='gallery:'+randomUUID();
  await prisma.mediaCdnPurge.create({data:{id,scope:'gallery',status:'pending',
    paths:['/gallery/owner/media/photo/v2/thumb.webp'],purgeOperations:[],
    availableAt:new Date(Date.now()-1000)}});
  return id;
}
async function dbIntent(id){return prisma.mediaCdnPurge.findUniqueOrThrow({where:{id}})}
async function completed(jobId){
  const job=await queue.getJob(jobId);
  if(!job)return false;
  if(await job.getState()!=='completed')return false;
  return job;
}
async function addJob(id){return queue.add('purge',{id},{jobId:id.slice(8).replaceAll('-',''),removeOnComplete:false,
  removeOnFail:false,attempts:1})}
async function runCase(name,fn){
  await fn();cases.push({name,status:'passed'});console.log('QA_CASE_PASS',name);
}
let failed=null;
try{
  const rows=await prisma.$queryRaw`SELECT current_database() AS db`;
  assert.equal(rows[0]?.db,pgURL.pathname.slice(1));
  writeFileSync(ledger,'',{flag:'wx',mode:0o600});
  await startRedis();
  queue=new Queue(queueName,{connection:queueConnection});
  queue.on('error',()=>{});await queue.waitUntilReady();
  await runCase('Redis outage during active BullMQ job reconnects and completes from SQL checkpoint',async()=>{
    const id=await createIntent();const first=startWorker('hold-redis');await first.wait('READY');
    if(process.env.GAFUS_RECOVERY_QA_SELF_SIGTERM==='YES'){
      // Manual abort smoke only: send SIGTERM to THIS controller PID, not a discovered process.
      process.kill(process.pid,'SIGTERM');
      await pause(4000);
      throw Error('RECOVERY_QA_SELF_SIGTERM_NOT_HANDLED');
    }
    const job=await addJob(id);await first.wait('CHECKPOINTED');
    const before=await dbIntent(id);assert.equal(before.status,'processing');
    assert.deepEqual(before.purgeOperations,[checkpoint]);assert.equal(readLedger().length,1);
    assert.equal(await job.getState(),'active');
    await stopRedis();assert.equal(await ping(),false);
    await startRedis();await queue.waitUntilReady();
    redisReconnected=await ping();assert.equal(redisReconnected,true);
    first.child.send({type:'RESUME',token});
    assert.ok(await eventually(()=>completed(job.id),'REDIS_JOB_COMPLETION',25000));
    const done=await dbIntent(id);assert.equal(done.status,'done');
    assert.equal(done.attempts,1);assert.deepEqual(done.purgeOperations,[]);
    assert.equal(readLedger().filter(x=>x.id===id).length,1);
    completed1=true;await stopWorker(first);
  });
  await runCase('SIGKILL of owned Worker after durable checkpoint causes BullMQ stalled reclaim without resubmission',async()=>{
    const id=await createIntent();const first=startWorker('hold-crash');await first.wait('READY');
    const job=await addJob(id);const ack=await first.wait('CHECKPOINTED');
    assert.equal(ack.id,id);const before=await dbIntent(id);
    assert.equal(before.status,'processing');assert.deepEqual(before.purgeOperations,[checkpoint]);
    assert.ok(before.attemptToken);assert.equal(readLedger().filter(x=>x.id===id).length,1);
    wasCheckpointBeforeKill=true;
    assert.equal(first.child.kill('SIGKILL'),true);
    const death=await waitExit(first.child,3000);assert.equal(death.signal,'SIGKILL');
    ownedChildren.delete(first.child);sigkills++;note('OWNED_CHILD_SIGKILL',{role:'worker-hold-crash'});
    // Advance ONLY the disposable 10-minute SQL lease after proving real SIGKILL.
    await prisma.mediaCdnPurge.update({where:{id},data:{leaseUntil:new Date(Date.now()-1000)}});
    const second=startWorker('resume-checkpoint');await second.wait('READY');
    const reused=await second.wait('REUSED_CHECKPOINT',35000);
    assert.equal(reused.id,id);
    const active=await dbIntent(id);
    assert.equal(active.status,'processing');
    assert.deepEqual(active.purgeOperations,[checkpoint]);
    assert.notEqual(active.attemptToken,before.attemptToken);
    assert.equal(active.attempts,2);
    // Real fencing against a *live new lease*, before it ACKs the outbox.
    const stale=createMediaCdnPurgeRepository();
    await assert.rejects(stale.complete({id,attemptToken:before.attemptToken}),/MEDIA_PURGE_LEASE_LOST/);
    staleTokenRejected=true;
    second.child.send({type:'RESUME',token});
    assert.ok(await eventually(()=>completed(job.id),'STALLED_BULLMQ_RECLAIM',22000));
    const messages=second.history.filter(x=>x.type==='REUSED_CHECKPOINT'&&x.id===id);
    checkpointReused=messages.length===1;assert.equal(checkpointReused,true);
    const done=await dbIntent(id);assert.equal(done.status,'done');
    assert.equal(done.attempts,2);assert.deepEqual(done.purgeOperations,[]);
    assert.equal(readLedger().filter(x=>x.id===id).length,1);
    stalledReclaim=true;completed2=true;
    await stopWorker(second);
  });
  await runCase('duplicate enqueue and stale SQL lease cannot trigger second provider submission',async()=>{
    assert.equal(staleTokenRejected,true);
    const all=readLedger();assert.equal(all.length,2);
    assert.equal(new Set(all.map(x=>x.id)).size,2);
    const rows=await prisma.mediaCdnPurge.findMany({where:{id:{startsWith:'gallery:'}}});
    assert.equal(rows.length,2);assert.equal(rows.filter(x=>x.status==='done').length,2);
    for(const row of rows){
      const first=await addJob(row.id);const again=await addJob(row.id);
      assert.equal(first.id,again.id);
      assert.equal(await first.getState(),'completed');
    }
    await pause(350);
    assert.equal(readLedger().length,2);
    duplicateEnqueueSuppressed=true;
  });
}catch(error){failed=error;console.error('RECOVERY_QA_FAIL',error?.stack??String(error));
  if(existsSync(workerLog))console.error('OWNED_QA_CHILD_LOG_TAIL',readFileSync(workerLog,'utf8').slice(-1800));
  if(existsSync(redisLog))console.error('OWNED_QA_REDIS_LOG_TAIL',readFileSync(redisLog,'utf8').slice(-500));
}
finally{
  // Close only references to processes spawned above, never discover other PIDs.
  for(const child of [...ownedChildren])if(child!==redis){
    if(child.exitCode===null && child.signalCode===null){
      if(child.connected)child.send({type:'SHUTDOWN',token});
      try{await waitExit(child,2000)}catch{if(child.pid)child.kill('SIGTERM');try{await waitExit(child,1500)}catch{}}
    }
    ownedChildren.delete(child);
  }
  if(queue){try{await Promise.race([queue.close(),pause(1500)])}catch{}}
  if(redis){try{await stopRedis()}catch(error){failed??=error}}
  try{await prisma.$disconnect()}catch{}
}
const allStopped=[...ownedChildren].length===0&&redis===null;
const redisDown=!(await ping());
const metrics={redisStarts,redisStops,redisUnavailable,redisReconnected,
  childSigkills:sigkills,checkpointBeforeKill:wasCheckpointBeforeKill,
  checkpointReused,stalledReclaim,staleTokenRejected,
  completedJobs:Number(completed1)+Number(completed2),duplicateEnqueueSuppressed,
  providerSubmitCount:readLedger().length,uniqueSubmittedJobs:new Set(readLedger().map(x=>x.id)).size,
  ownedResourcesCleaned:allStopped&&redisDown};
const evidence={schema:1,mode:'real-bullmq-redis-aof-plus-sql-fenced-qa-bridge',
  provider:'synthetic-fsynced-ledger-no-network',db:'disposable-loopback-postgresql18-db-push',
  queueName,port,ownedPids,cases,metrics,audit,failed:failed?String(failed.message):null};
const evidencePath=join(dirname(report),'recovery.json');
writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
writeFileSync(report,JSON.stringify({numPassedTests:cases.length,numFailedTests:failed?1:0,
  numPendingTests:0,testResults:[{name:resolve(import.meta.filename),assertionResults:cases.map(x=>({
    fullName:x.name,title:x.name,status:x.status}))}]},null,2)+'\n',{mode:0o600});
console.log('RECOVERY_QA_METRICS',JSON.stringify(metrics));
if(failed||cases.length!==3||!metrics.ownedResourcesCleaned){process.exitCode=2}
