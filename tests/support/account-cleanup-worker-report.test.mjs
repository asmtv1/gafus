import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {verifyAccountCleanupWorkerReport} from './account-cleanup-worker-report.mjs';
const root=resolve(import.meta.dirname,'../..');
const cases=['transactional_three_scope_enqueue','fake_storage_sweep_and_cdn_checkpoint',
 'queued_cdn_ack_to_sql_done','idempotent_worker_rerun','foreign_user_and_audit_unchanged',
 'redis_isolated_and_sql_queue_fenced'];
const phases=['enqueued','fake_sweep_checkpoint','fake_ack_done','second_drain_noop',
 'foreign_and_audit_intact','sql_queue_redis_receipt'];
const scopes=['feed','gallery','public'];
const sources=['packages/worker/src/accountCleanupWorker.ts',
 'packages/identity-write-server/src/account-cleanup-worker-rows.ts',
 'packages/identity-write-server/src/accountDeletionRows.ts',
 'packages/core/src/services/accountCleanup/enqueue.ts',
 'packages/identity-write-server/src/account-cleanup-records.ts',
 'packages/core/src/services/gallery/accountCleanup.ts',
 'packages/core/src/services/feed/cleanup.ts',
 'packages/worker/src/test/qa-account-cleanup-fake-worker.test.ts'];
const sha=f=>createHash('sha256').update(readFileSync(resolve(root,f))).digest('hex');
const task={id:'api.account-cleanup.fake-storage-worker',kind:'account-cleanup-worker',expectedCases:cases};
function fixture(){
 const run='abcdef123456', db=`archqa_worker_${run}`;
 const ownKeys={feed:'posts/owner/posts/own.webp',gallery:'albums/owner/album/own.webp',public:'uploads/users/owner/own.webp'};
 const otherKeys={feed:'posts/other/posts/safe.webp',gallery:'albums/other/album/safe.webp',public:'uploads/users/other/safe.webp'};
 const rows=phases.map((label,i)=>({label,queue:scopes.map((scope,j)=>({
  scope,status:i<2?'pending':'done',attempts:i===0?0:i===1?1:2,
  keys:i<2?1:0,prefixes:[],keyCursor:0,
  operations:i===0?[]:[`fake-${scope}-${j+1}`],pendingPurge:i!==0,
  scheduledFuture:i<2,attemptTokenPresent:false,leasePresent:false,errorCode:null,
 })),otherIntact:true,auditCount:1,auditHash:'f'.repeat(64),auditInitiatedBy:'SELF_SERVICE',
  counter:1,storage:Object.fromEntries(scopes.map(scope=>[scope,i===0?[ownKeys[scope],otherKeys[scope]]:[otherKeys[scope]]])),
  events:i===0?0:i===1?6:12,
  cdnSubmissions:i===0?0:3,sweeps:i===0?0:i===1?3:6,cdnPolls:i<2?0:3,
  redis:{pong:'PONG',keyCount:0,queueBackend:'SQL AccountStorageCleanup, not BullMQ'},
 }));
 const events=[];
 for(let i=0;i<3;i++){
  const scope=scopes[i];
  events.push({kind:'fake_sweep',scope,prefixes:[`${scope}/owner/`],keys:[],removed:[ownKeys[scope]]},
    {kind:'fake_cdn_submit',scope,op:`fake-${scope}-${i+1}`,prefixes:[`${scope}/owner/`]});
 }
 for(let i=0;i<3;i++){
  const scope=scopes[i];
  events.push({kind:'fake_sweep',scope,prefixes:[`${scope}/owner/`],keys:[],removed:[]},
    {kind:'fake_cdn_ack',operations:[`fake-${scope}-${i+1}`],ok:true});
 }
 const evidence={schema:1,run,storage:'local-in-memory-fake',
  worker:'original processAccountStorageCleanup and SQL lease repository',
  queueBackend:'PostgreSQL AccountStorageCleanup, not BullMQ',cases,db,
  postgresPort:49511,redisPort:49512,
  sourceHashes:Object.fromEntries(sources.map(p=>[p,sha(p)])),
  phases:rows,events,ownKeys,otherKeys,firstAuditHash:'f'.repeat(64),
  ownerHash:'1'.repeat(64),foreignHash:'2'.repeat(64),externalStorageTouched:false,
  externalCdnTouched:false};
 const resources={schema:1,run,db,postgresPort:49511,redisPort:49512,
  ownedPostgresStopped:true,ownedRedisStopped:true,temporaryDirectoryRemoved:true,
  fakeStorageOnly:true,cloudStorageTouched:false,externalCdnTouched:false,
  runnerSha256:sha('scripts/qa/account-cleanup-fake-storage-isolated.sh')};
 const tests={numPassedTests:6,numFailedTests:0,numPendingTests:0,success:true,
  testResults:[{name:resolve(root,'packages/worker/src/test/qa-account-cleanup-fake-worker.test.ts'),
   assertionResults:cases.map(title=>({title,status:'passed'}))}]};
 return {tests,evidence,resources};
}
const check=x=>verifyAccountCleanupWorkerReport(x.tests,x.evidence,x.resources,task,root);
const denied=fn=>{const x=fixture();fn(x);assert.throws(()=>check(x),/QA_FAKE_WORKER_RECEIPT_/)};

test('six actual Worker/SQL/fake-storage stages and exact planned cases are verified',()=>{
 const result=check(fixture());assert.equal(result.cases.length,6);
 assert.equal(result.fakeStorageSweeps,6);assert.equal(result.fakeCdnAcknowledgements,3);
 assert.equal(result.externalCloudVerified,false);
});
test('fake successful cleanup is rejected for missing CDN acknowledgement or wrong queued SQL state',()=>{
 for(const fn of [
  x=>x.evidence.phases[1].queue[0].status='done',
  x=>x.evidence.phases[2].queue[0].status='pending',
  x=>x.evidence.phases[3].queue[0].attempts=3,
  x=>x.evidence.phases[2].queue[1].leasePresent=true,
  x=>x.evidence.events[7].ok=false,
  x=>x.evidence.phases[2].cdnSubmissions=4,
  x=>x.evidence.phases[5].cdnPolls=5,
 ])denied(fn);
});
test('foreign user deleted, audit mutated, owner fake object retained or external cloud claim fail closed',()=>{
 for(const fn of [
  x=>x.evidence.phases[4].otherIntact=false,
  x=>x.evidence.phases[4].auditHash='0'.repeat(64),
  x=>x.evidence.phases[5].auditCount=2,
  x=>x.evidence.phases[1].storage.feed.push(x.evidence.ownKeys.feed),
  x=>x.evidence.phases[2].storage.public=[],
  x=>x.evidence.events[0].removed=[x.evidence.otherKeys.feed],
  x=>x.evidence.externalStorageTouched=true,
  x=>x.resources.cloudStorageTouched=true,
 ])denied(fn);
});
test('unverified resources, stale sources, falsified test case or wrong queue backend fail closed',()=>{
 for(const fn of [
  x=>x.resources.ownedRedisStopped=false,
  x=>x.resources.ownedPostgresStopped=false,
  x=>x.resources.runnerSha256='a'.repeat(64),
  x=>x.evidence.sourceHashes[sources[0]]='a'.repeat(64),
  x=>x.tests.testResults[0].assertionResults[0].status='skipped',
  x=>x.evidence.queueBackend='BullMQ',
  x=>x.evidence.phases[2].redis.keyCount=2,
  x=>x.evidence.phases.pop(),
 ])denied(fn);
});
