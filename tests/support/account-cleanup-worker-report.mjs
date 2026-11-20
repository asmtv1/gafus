/** Advisory-only strict attestation of original Worker SQL queue + fake-storage run. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const cases=['transactional_three_scope_enqueue','fake_storage_sweep_and_cdn_checkpoint',
 'queued_cdn_ack_to_sql_done','idempotent_worker_rerun','foreign_user_and_audit_unchanged',
 'redis_isolated_and_sql_queue_fenced'];
const phases=['enqueued','fake_sweep_checkpoint','fake_ack_done','second_drain_noop',
 'foreign_and_audit_intact','sql_queue_redis_receipt'];
const scopes=['feed','gallery','public'];
const sourcePaths=['packages/worker/src/accountCleanupWorker.ts',
 'packages/identity-write-server/src/account-cleanup-worker-rows.ts',
 'packages/identity-write-server/src/accountDeletionRows.ts',
 'packages/core/src/services/accountCleanup/enqueue.ts',
 'packages/identity-write-server/src/account-cleanup-records.ts',
 'packages/core/src/services/gallery/accountCleanup.ts',
 'packages/core/src/services/feed/cleanup.ts',
 'packages/worker/src/test/qa-account-cleanup-fake-worker.test.ts'];
const hash=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const reject=(message)=>{throw Error('QA_FAKE_WORKER_RECEIPT_'+message)};
const equal=(actual,expected,message)=>{if(JSON.stringify(actual)!==JSON.stringify(expected))reject(message)};
export function verifyAccountCleanupWorkerReport(tests,evidence,resources,task,root){
 const definition=JSON.parse(readFileSync(resolve(root,'tests/catalog/account-cleanup-worker-cases.json'),'utf8'));
 if(task?.kind!=='account-cleanup-worker'||task.id!=='api.account-cleanup.fake-storage-worker'||
   definition.schema!==1)reject('BAD_ADVISORY_PLAN');
 equal(task.expectedCases,cases,'EXPECTED_CASES_MISMATCH');
 equal(definition.cases,cases,'CATALOG_CASES_MISMATCH');
 if(!tests||tests.numPassedTests!==6||tests.numFailedTests!==0||tests.numPendingTests!==0||
    tests.success!==true||tests.testResults?.length!==1||
    tests.testResults[0].name!==resolve(root,'packages/worker/src/test/qa-account-cleanup-fake-worker.test.ts'))
   reject('FAILED_MISSING_OR_FOREIGN_VITEST_PROOF');
 equal(tests.testResults[0].assertionResults?.map(x=>[x.title,x.status]),cases.map(c=>[c,'passed']),
   'VITEST_NAMED_CASES_NOT_PASSED');
 if(!evidence||evidence.schema!==1||!/^[a-f0-9]{12}$/.test(evidence.run??'')||
    evidence.db!==`archqa_worker_${evidence.run}`||
    evidence.storage!=='local-in-memory-fake'||
    evidence.worker!=='original processAccountStorageCleanup and SQL lease repository'||
    evidence.queueBackend!=='PostgreSQL AccountStorageCleanup, not BullMQ'||
    evidence.externalStorageTouched!==false||evidence.externalCdnTouched!==false||
    !Number.isSafeInteger(evidence.postgresPort)||evidence.postgresPort<1024||
    !Number.isSafeInteger(evidence.redisPort)||evidence.redisPort<1024||
    evidence.redisPort===evidence.postgresPort||
    !/^[a-f0-9]{64}$/.test(evidence.ownerHash??'')||
    !/^[a-f0-9]{64}$/.test(evidence.foreignHash??'')||
    evidence.ownerHash===evidence.foreignHash)reject('UNSAFE_NONISOLATED_FAKE_STORAGE_PROOF');
 equal(evidence.cases,cases,'FAKE_STORAGE_EVIDENCE_CASES_DRIFT');
 for(const p of sourcePaths)if(evidence.sourceHashes?.[p]!==hash(resolve(root,p)))
    reject('ORIGINAL_WORKER_SOURCE_DRIFT_'+p);
 if(!resources||resources.schema!==1||resources.run!==evidence.run||
    resources.db!==evidence.db||resources.postgresPort!==evidence.postgresPort||
    resources.redisPort!==evidence.redisPort||resources.ownedPostgresStopped!==true||
    resources.ownedRedisStopped!==true||resources.temporaryDirectoryRemoved!==true||
    resources.fakeStorageOnly!==true||resources.cloudStorageTouched!==false||
    resources.externalCdnTouched!==false||
    resources.runnerSha256!==hash(resolve(root,'scripts/qa/account-cleanup-fake-storage-isolated.sh')))
    reject('UNVERIFIED_RESOURCE_CLEANUP');
 if(!Array.isArray(evidence.phases)||evidence.phases.length!==6||
    !Array.isArray(evidence.events)||evidence.events.length!==12)
    reject('INCOMPLETE_SQL_QUEUE_FAKE_EVENTS');
 for(let i=0;i<phases.length;i++){
  const s=evidence.phases[i];
  if(!s||s.label!==phases[i]||s.otherIntact!==true||
    s.auditCount!==1||s.auditInitiatedBy!=='SELF_SERVICE'||
    s.auditHash!==evidence.firstAuditHash||
    !Number.isSafeInteger(s.counter)||!Array.isArray(s.queue)||s.queue.length!==3||
    s.redis?.pong!=='PONG'||s.redis.keyCount!==0||
    s.redis.queueBackend!=='SQL AccountStorageCleanup, not BullMQ')
    reject('FOREIGN_AUDIT_SQL_QUEUE_OR_REDIS_'+i);
  equal(s.queue.map(q=>q.scope),scopes,'NOT_THREE_OWNER_SCOPES_'+i);
  for(const q of s.queue){
   const status=i===0?'pending':i===1?'pending':'done';
   const attempts=i===0?0:i===1?1:2;
   if(q.status!==status||q.attempts!==attempts||
      q.leasePresent!==false||q.attemptTokenPresent!==false||q.errorCode!==null||
      !Array.isArray(q.operations)||q.operations.length!==(i===0?0:1)||
      (i===1&&q.pendingPurge!==true)||(i>=2&&q.keys!==0))
     reject('LEASE_STATUS_CHECKPOINT_ATTEMPTS_'+i+'_'+q.scope);
  }
  const expectedSubmits=i===0?0:3, expectedSweeps=i===0?0:i===1?3:6,
    expectedPolls=i<2?0:3, expectedEvents=i===0?0:i===1?6:12;
  if(s.cdnSubmissions!==expectedSubmits||s.sweeps!==expectedSweeps||
     s.cdnPolls!==expectedPolls||s.events!==expectedEvents)
    reject('FAKE_STORAGE_QUEUE_REPLAY_METRICS_'+i);
  for(const scope of scopes){
   const arr=s.storage?.[scope];
   if(!Array.isArray(arr))reject('MISSING_FAKE_STORAGE_'+scope);
   const owner=evidence.ownKeys?.[scope],other=evidence.otherKeys?.[scope];
   if(typeof owner!=='string'||typeof other!=='string'||owner===other||
     !owner.includes('/')||!other.includes('/')||
     !arr.includes(other)||arr.includes(owner)!==(i===0)||arr.length!==(i===0?2:1))
       reject('WRONG_USER_FAKE_STORAGE_DELETE_'+i+'_'+scope);
  }
 }
 const events=evidence.events;
 for(let i=0;i<3;i++){
  const sweep=events[i*2],purge=events[i*2+1];
  if(sweep?.kind!=='fake_sweep'||sweep.scope!==scopes[i]||
     !Array.isArray(sweep.removed)||sweep.removed.length!==1||
     sweep.removed[0]!==evidence.ownKeys[scopes[i]]||
     purge?.kind!=='fake_cdn_submit'||purge.scope!==scopes[i]||
     purge.op!==`fake-${scopes[i]}-${i+1}`)
   reject('UNEXPECTED_FAKE_PROVIDER_TARGET_'+i);
  const afterSweep=events[6+i*2],afterAck=events[7+i*2];
  if(afterSweep?.kind!=='fake_sweep'||afterSweep.scope!==scopes[i]||
     afterSweep.removed?.length!==0||afterAck?.kind!=='fake_cdn_ack'||
     afterAck.ok!==true||afterAck.operations?.length!==1||
     afterAck.operations[0]!==purge.op)
    reject('MISSING_FAKE_CDN_ACK_'+i);
 }
 return {advisory:true,cases:cases.map(name=>({name,status:'passed'})),
  sqlQueueScopes:scopes,sqlSnapshots:6,queuePhases:6,fakeStorageSweeps:6,
  fakeCdnSubmissions:3,fakeCdnAcknowledgements:3,idempotentRepeat:true,
  foreignUserPreserved:true,auditUnchanged:true,redisQueueBackend:'PostgreSQL (Redis not used)',
  resourcesCleaned:true,externalCloudVerified:false};
}
