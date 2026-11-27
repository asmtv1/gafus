import { test } from "node:test";
import assert from "node:assert/strict";
import { boundedSnapshot, countStates, failureCategory, parseReplayRequest, readQueueSnapshot, renderOperations, replayFailedJob, type DiagnosticJob, type DiagnosticQueue } from "./queue-operations.js";

const now=1_800_000_000_000;
const job=(extra:Partial<DiagnosticJob>={}):DiagnosticJob=>({
  id:"job-1",timestamp:now-60_000,attemptsMade:2,finishedOn:now-1000,
  failedReason:"ETIMEDOUT secret=never-print",opts:{attempts:3},
  getState:async()=>"failed",retry:async()=>{},...extra,
});
function queue(name="consent-log-cleanup",states:Record<string,DiagnosticJob[]>={}):DiagnosticQueue {
  return {name,
    getJobCounts:async(...types)=>Object.fromEntries(types.map(state=>[state,states[state]?.length??0])),
    getJobs:async(types,start,end)=>types.flatMap(state=>states[state]??[]).slice(start,end+1),
    isPaused:async()=>false,getJob:async(id)=>Object.values(states).flat().find(j=>j.id===id),
  };
}
const request={queue:"consent-log-cleanup",id:"job-1",attemptsMade:2,finishedOn:now-1000,confirmation:"REPLAY_FAILED_JOB"};

test("oldest creation age includes active, delayed and priority without counting paused twice",async()=>{
  const q=queue("push",{wait:[job({timestamp:now-120_000})],paused:[job({timestamp:now-90_000})],prioritized:[job({timestamp:now-400_000})],active:[job()],failed:[job()]});
  const row=await readQueueSnapshot(q,now);
  assert.equal(row.oldestAgeSeconds,400);
  assert.equal(row.sampleComplete,true);
  assert.equal(row.counts.wait,1);
  assert.equal(row.counts.paused,1);
  assert.equal(row.sampledRetries,4);
  assert.equal(row.failed[0].reason,"network_or_timeout");
  assert.deepEqual(Object.keys(row.counts),[...countStates]);
  assert.doesNotMatch(JSON.stringify(row),/secret=never-print/);
});
test("truncated sample is an explicitly incomplete lower bound",async()=>{
  const q=queue("push",{wait:Array.from({length:40},()=>job())});
  const row=await readQueueSnapshot(q,now);
  assert.equal(row.counts.wait,40);
  assert.equal(row.sampleComplete,false);
  assert.equal(row.oldestAgeSeconds,60);
});
test("unavailable Redis or rejected reads never become zero counts",async()=>{
  const q=queue("push");
  q.getJobCounts=async()=>{throw Error("secret")};
  assert.deepEqual(await boundedSnapshot(q,()=>false),{name:"push",available:false});
  assert.deepEqual(await boundedSnapshot(q,()=>true),{name:"push",available:false});
});
test("stuck Redis read is singleflight, does not create fresh pending commands",async()=>{
  const q=queue();
  let calls=0;let release!:()=>void;
  q.getJobCounts=async(...types)=>{calls++;await new Promise<void>(r=>release=r);return Object.fromEntries(types.map(t=>[t,0]));};
  assert.equal((await boundedSnapshot(q,()=>true,10)).available,false);
  assert.equal((await boundedSnapshot(q,()=>true,10)).available,false);
  assert.equal(calls,1);
  release();
});
test("replay validates immutable attempt and failed state; ACK means queued only",async()=>{
  let calls=0;
  const q=queue("consent-log-cleanup",{failed:[job({retry:async state=>{assert.equal(state,"failed");calls++;}})]});
  assert.equal(await replayFailedJob(q,{...request,attemptsMade:1},()=>true),"STALE_JOB");
  assert.equal(await replayFailedJob(q,request,()=>true),"QUEUED");
  assert.equal(calls,1);
  assert.equal(await replayFailedJob(queue("push",{failed:[job()]}),{...request,queue:"push"},()=>true),"RECONCILIATION_REQUIRED");
});
test("lost replay ACK is unknown, never success; malformed and unconfirmed input rejected",async()=>{
  const q=queue("consent-log-cleanup",{failed:[job({retry:async()=>{throw Error("network lost")}})]});
  assert.equal(await replayFailedJob(q,request,()=>true),"UNKNOWN_ACK");
  const form={...request,attemptsMade:"2",finishedOn:String(now-1000)};
  assert.deepEqual(parseReplayRequest(form),request);
  assert.equal(parseReplayRequest({...form,confirmation:"yes"}),null);
  assert.equal(parseReplayRequest({...form,id:"<script>"}),null);
  assert.equal(parseReplayRequest({...form,unknown:"x"}),null);
});
test("rendered dashboard escapes IDs, avoids raw failure and states replay outcome clearly",async()=>{
  const row=await boundedSnapshot(queue("consent-log-cleanup",{failed:[job({timestamp:Date.now()-10000})]}),()=>true);
  const page=renderOperations([row,{name:"<script>",available:false}],"QUEUED");
  assert.match(page,/REPLAY_FAILED_JOB/);
  assert.match(page,/Выполнение ещё не подтверждено/);
  assert.match(page,/&lt;script&gt;/);
  assert.doesNotMatch(page,/secret=never-print|<script>/);
  assert.equal(failureCategory("failed: https://secret.example"),"other_review_logs");
});
