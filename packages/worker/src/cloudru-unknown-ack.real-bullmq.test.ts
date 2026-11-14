/** Opt-in real BullMQ/throwaway loopback Redis ACK test. Never shared queues. */
import {randomUUID} from "node:crypto";
import {Queue,QueueEvents,Worker} from "bullmq";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {safeCloudruWakeFailure} from "./cloudru-trigger-error-policy.js";

const port=Number(process.env.GAFUS_CLOUDRU_BULLMQ_QA_PORT??"");
const allowed=process.env.GAFUS_CLOUDRU_BULLMQ_ISOLATED_QA==="1" &&
  process.env.NODE_ENV==="test" &&
  Number.isInteger(port)&&port>=1024&&port<=65535;
const suite=allowed?describe:describe.skip;
const queueName="gafus-cloudru-unknown-ack-qa-"+randomUUID();
const connection={host:"127.0.0.1",port,maxRetriesPerRequest:null as null};
let queue:Queue|undefined,events:QueueEvents|undefined,worker:Worker|undefined;
let ambiguousLaunches=0,rejectedLaunches=0;
suite("real BullMQ 5-retry Cloud.ru wake-up uncertainty",()=>{
 beforeAll(async()=>{
  if(!allowed)throw Error("CLOUDRU_BULLMQ_NON_ISOLATED_DENIED");
  queue=new Queue(queueName,{connection});
  events=new QueueEvents(queueName,{connection});
  worker=new Worker(queueName,async job=>{
   if(job.data.mode==="ambiguous"){
    ambiguousLaunches++;
    throw safeCloudruWakeFailure(Error("CLOUDRU_JOB_EXECUTION_NETWORK_TIMEOUT"));
   }
   if(job.data.mode==="rejected"){
    rejectedLaunches++;
    if(rejectedLaunches===1)
      throw safeCloudruWakeFailure(Error("CLOUDRU_JOB_EXECUTION_FAILED_gafus-chat-video_429"));
    return "launched-on-retry";
   }
   throw Error("BULLMQ_UNKNOWN_TEST_FIXTURE");
  },{connection,concurrency:1});
  await Promise.all([queue.waitUntilReady(),events.waitUntilReady(),worker.waitUntilReady()]);
 },12000);
 afterAll(async()=>{
  await worker?.close();
  await events?.close();
  await queue?.obliterate({force:true});
  await queue?.close();
 },12000);
 it("unknown POST ACK invokes provider only once despite five BullMQ attempts",async()=>{
  const job=await queue!.add("wake",{mode:"ambiguous"},{attempts:5,
    backoff:{type:"exponential",delay:100},removeOnFail:false});
  await expect(job.waitUntilFinished(events!,7000))
    .rejects.toThrow("CLOUDRU_JOB_EXECUTION_ACK_UNKNOWN");
  expect(await job.getState()).toBe("failed");
  expect((await queue!.getJob(job.id!))?.attemptsMade).toBe(1);
  await new Promise(resolve=>setTimeout(resolve,450));
  expect(ambiguousLaunches).toBe(1);
 });
 it("explicit Cloud HTTP 429 safely retries once and succeeds",async()=>{
  const job=await queue!.add("wake",{mode:"rejected"},{attempts:2,
    backoff:{type:"fixed",delay:100},removeOnComplete:false});
  await expect(job.waitUntilFinished(events!,7000)).resolves.toBe("launched-on-retry");
  expect(rejectedLaunches).toBe(2);
  expect(await job.getState()).toBe("completed");
 });
});
