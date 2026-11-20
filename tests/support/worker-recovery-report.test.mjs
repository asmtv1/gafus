import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyWorkerRecoveryReport} from './worker-recovery-report.mjs';
const names=[
  'Redis outage during active BullMQ job reconnects and completes from SQL checkpoint',
  'SIGKILL of owned Worker after durable checkpoint causes BullMQ stalled reclaim without resubmission',
  'duplicate enqueue and stale SQL lease cannot trigger second provider submission',
];
const task={id:'worker.redis-recovery.pg-redis',kind:'recovery',expectedCases:names};
const root='/qa-isolated-source';
function fixtures(){
  return {raw:{
    schema:1,mode:'real-bullmq-redis-aof-plus-sql-fenced-qa-bridge',
    provider:'synthetic-fsynced-ledger-no-network',
    db:'disposable-loopback-postgresql18-db-push',queueName:'gafus-qa-recover-1234567890abcdef',
    port:32017,failed:null,cases:names.map(name=>({name,status:'passed'})),
    ownedPids:[
      {role:'redis',pid:3201},{role:'redis',pid:3202},
      {role:'worker-hold-redis',pid:3203},{role:'worker-hold-crash',pid:3204},
      {role:'worker-resume-checkpoint',pid:3205}],
    audit:[
      {type:'REDIS_READY'},{type:'CHECKPOINTED'},
      {type:'REDIS_DISCONNECTED'},{type:'REDIS_READY'},
      {type:'CHECKPOINTED'},{type:'OWNED_CHILD_SIGKILL',role:'worker-hold-crash'},
      {type:'REUSED_CHECKPOINT'},{type:'REDIS_DISCONNECTED'}],
    metrics:{redisStarts:2,redisStops:2,redisUnavailable:true,redisReconnected:true,
      childSigkills:1,checkpointBeforeKill:true,checkpointReused:true,stalledReclaim:true,
      staleTokenRejected:true,completedJobs:2,duplicateEnqueueSuppressed:true,
      providerSubmitCount:2,uniqueSubmittedJobs:2,ownedResourcesCleaned:true},
  },tests:{numPassedTests:3,numFailedTests:0,numPendingTests:0,testResults:[{
    name:root+'/packages/worker/qa/recovery-controller.mjs',
    assertionResults:names.map(name=>({fullName:name,title:name,status:'passed'}))}]}};
}
const check=(x)=>verifyWorkerRecoveryReport(x.raw,x.tests,task,root);
test('real-resource recovery evidence is only informational and demands exact 3 named cases',()=>{
  const receipt=check(fixtures());
  assert.equal(receipt.advisory,true);
  assert.equal(receipt.verifiedCases.length,3);
  assert.equal(receipt.ownedWorkerSigkills,1);
  assert.equal(receipt.redisStartStopPairs,2);
  assert.equal(receipt.providerSubmitCount,2);
});
test('forged provider count, absent Redis reconnection, absent SIGKILL and stale SQL claim all fail closed',()=>{
  for(const [field,bad] of [
    ['providerSubmitCount',3],['uniqueSubmittedJobs',1],['redisReconnected',false],
    ['childSigkills',0],['stalledReclaim',false],['checkpointReused',false],
    ['staleTokenRejected',false],['ownedResourcesCleaned',false],['completedJobs',1]]){
    const f=fixtures();f.raw.metrics[field]=bad;
    assert.throws(()=>check(f),/RECOVERY_MISSING_REDIS_KILL_QUEUE_OR_SQL_PROOF/,field);
  }
});
test('missing/reordered audit events or unowned PID set are rejected',()=>{
  for(const tamper of [
    f=>f.raw.audit.splice(f.raw.audit.findIndex(x=>x.type==='REUSED_CHECKPOINT'),1),
    f=>f.raw.audit.find(x=>x.type==='OWNED_CHILD_SIGKILL').type='UNKNOWN',
    f=>f.raw.ownedPids[4].pid=f.raw.ownedPids[0].pid,
    f=>f.raw.ownedPids[3].role='production',
  ]){
    const f=fixtures();tamper(f);
    assert.throws(()=>check(f),/RECOVERY_(MISSING_ORDERED_OWNED_EVENTS|UNVERIFIED_OWNED_PROCESS_SET)/);
  }
});
test('receipt must prove exact own source, unique PASS outcomes and zero pending/failures',()=>{
  for(const tamper of [
    f=>f.tests.testResults[0].name='/foreign/worker.js',
    f=>f.tests.testResults[0].assertionResults[1].fullName=names[0],
    f=>f.tests.testResults[0].assertionResults[1].status='skipped',
    f=>f.tests.numPendingTests=1,
    f=>f.raw.cases.pop(),
    f=>f.raw.failed='test failed',
  ]){
    const f=fixtures();tamper(f);assert.throws(()=>check(f),/RECOVERY_/);
  }
});
