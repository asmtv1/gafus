/** Fail-closed *informational* verification of real child process / Redis / BullMQ QA receipts. */
const exactCases=[
  'Redis outage during active BullMQ job reconnects and completes from SQL checkpoint',
  'SIGKILL of owned Worker after durable checkpoint causes BullMQ stalled reclaim without resubmission',
  'duplicate enqueue and stale SQL lease cannot trigger second provider submission',
];
const modes=['worker-hold-redis','worker-hold-crash','worker-resume-checkpoint'];
export function verifyWorkerRecoveryReport(evidence,tests,task,root){
  if(task?.kind!=='recovery'||task.id!=='worker.redis-recovery.pg-redis'||
     JSON.stringify(task.expectedCases)!==JSON.stringify(exactCases))
     throw Error('RECOVERY_UNREGISTERED_OR_CHANGED_TEST_PLAN');
  const a=evidence, m=a?.metrics;
  if(!a||a.schema!==1||a.mode!=='real-bullmq-redis-aof-plus-sql-fenced-qa-bridge'||
     a.provider!=='synthetic-fsynced-ledger-no-network'||
     a.db!=='disposable-loopback-postgresql18-db-push'||a.failed!==null||
     !/^gafus-qa-recover-[a-f0-9]{16}$/.test(a.queueName??'')||
     !Number.isInteger(a.port)||a.port<1024||a.port>65535 ||
     !Array.isArray(a.cases)||JSON.stringify(a.cases)!==JSON.stringify(exactCases.map(name=>({name,status:'passed'}))))
    throw Error('RECOVERY_MISSING_OR_FORGED_CASE_RECEIPT');
  if(!m || m.redisStarts!==2 || m.redisStops!==2 ||m.redisUnavailable!==true||
    m.redisReconnected!==true||m.childSigkills!==1||m.checkpointBeforeKill!==true||
    m.checkpointReused!==true||m.stalledReclaim!==true||m.staleTokenRejected!==true||
    m.completedJobs!==2||m.duplicateEnqueueSuppressed!==true||
    m.providerSubmitCount!==2||m.uniqueSubmittedJobs!==2||m.ownedResourcesCleaned!==true)
    throw Error('RECOVERY_MISSING_REDIS_KILL_QUEUE_OR_SQL_PROOF');
  const pids=a.ownedPids;
  if(!Array.isArray(pids)||pids.length!==5 || new Set(pids.map(p=>p.pid)).size!==5 ||
     pids.some(p=>!Number.isSafeInteger(p.pid)||p.pid<=1)||
     pids.filter(p=>p.role==='redis').length!==2||
     modes.some(mode=>pids.filter(p=>p.role===mode).length!==1))
     throw Error('RECOVERY_UNVERIFIED_OWNED_PROCESS_SET');
  const events=a.audit;
  if(!Array.isArray(events)||events.filter(x=>x.type==='REDIS_READY').length!==2||
    events.filter(x=>x.type==='REDIS_DISCONNECTED').length!==2||
    events.filter(x=>x.type==='CHECKPOINTED').length!==2||
    events.filter(x=>x.type==='REUSED_CHECKPOINT').length!==1||
    events.filter(x=>x.type==='OWNED_CHILD_SIGKILL' && x.role==='worker-hold-crash').length!==1 ||
    events.findIndex(x=>x.type==='REUSED_CHECKPOINT')<=events.findIndex(x=>x.type==='OWNED_CHILD_SIGKILL'))
    throw Error('RECOVERY_MISSING_ORDERED_OWNED_EVENTS');
  if(tests?.numPassedTests!==3||tests.numFailedTests!==0||tests.numPendingTests!==0||
    !Array.isArray(tests.testResults)||tests.testResults.length!==1 ||
    tests.testResults[0]?.name!==root+'/packages/worker/qa/recovery-controller.mjs')
    throw Error('RECOVERY_INVALID_NAMED_TEST_RESULT');
  const items=tests.testResults[0].assertionResults;
  if(!Array.isArray(items)||items.length!==3||
     JSON.stringify(items.map(x=>({name:x.fullName,status:x.status})))!==
       JSON.stringify(exactCases.map(name=>({name,status:'passed'}))))
    throw Error('RECOVERY_NAMED_CASES_ABSENT_DUPLICATE_OR_FAILED');
  return {kind:'real-isolated-recovery-informational',advisory:true,
    providerMode:a.provider,databaseMode:a.db,topology:a.mode,
    verifiedCases:exactCases.map(name=>({name,status:'passed'})),
    redisStartStopPairs:m.redisStops,ownedWorkerSigkills:m.childSigkills,
    stalledReclaim:m.stalledReclaim,checkpointReused:m.checkpointReused,
    providerSubmitCount:m.providerSubmitCount,completedJobs:m.completedJobs,
    ownedResourcesCleaned:m.ownedResourcesCleaned};
}
