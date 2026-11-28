import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { prisma } from "@gafus/prisma";
import { offlineRoutes } from "../src/routes/v1/offline";
import { createNewOnlyV2Queues } from "../../mobile/src/shared/lib/offline/newOnlyV2Queues";
import { replayProgressJournal, type ProgressReplayTransport } from "../../mobile/src/shared/lib/offline/replayProgressJournal";

const legacy = {
  "progress-sync-storage": '{"state":{"queue":[{"queueId":"LEGACY"}]}}',
  "prevention-sync-storage": '{"state":{"queue":[{"clientId":"OLD"}]}}',
  "offline-storage": "{not-json-old-but-retain}",
};
function fileStore(file: string) {
  const load = (): Record<string,string> => existsSync(file) ? JSON.parse(readFileSync(file,"utf8")) : {};
  const save = (value: Record<string,string>) => {
    const temp = file+".next";
    writeFileSync(temp,JSON.stringify(value),{mode:0o600});
    renameSync(temp,file);
  };
  return {
    getItem: async (key:string) => load()[key] ?? null,
    setItem: async (key:string,value:string) => save({...load(),[key]:value}),
    removeItem: async (key:string) => { const data=load(); delete data[key]; save(data); },
    getAllKeys: async () => Object.keys(load()),
  };
}
function client(name:string) {
  const dir=join(process.env.GAFUS_STAGE9_DIR!,name);
  mkdirSync(dir,{recursive:true});
  const storage=fileStore(join(dir,"storage.json"));
  const secure=fileStore(join(dir,"secure.json"));
  return {
    storage,
    open:()=>createNewOnlyV2Queues({
      storage, secure:{getItemAsync:secure.getItem,setItemAsync:secure.setItem,deleteItemAsync:secure.removeItem},
      makeId:randomUUID,now:Date.now,
    }),
  };
}
let owner="", other="", trainer="", courseId="", dayOnCourseId="", scheduleId="", bundleStepId="", videoId="";
const steps: {id:string;link:string}[]=[];
const app = new Hono();
app.use("*",async(c,next)=>{
  // Synthetic actor only, not a JWT/authentication acceptance test.
  const actor=c.req.header("x-stage9-actor");
  if (!actor || ![owner,other,trainer].includes(actor)) return c.json({error:"UNAUTHORIZED"},401);
  c.set("user" as never,{id:actor,role:actor===trainer?"TRAINER":"USER"} as never);
  await next();
});
app.route("/api/v1/offline",offlineRoutes);
function transport(actor:string):ProgressReplayTransport {
  return async request=>{
    const response=await app.request(request.path,{method:"POST",headers:{
      ...request.headers,"content-type":"application/json","x-stage9-actor":actor,"x-platform":"ANDROID",
    },body:JSON.stringify(request.body)});
    const body=await response.json();
    expect(response.status,JSON.stringify(body)).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    return body;
  };
}
function stepPayload(i:number) {
  return {courseId,dayOnCourseId,stepIndex:i,expectedStepOnDayId:steps[i].link,expectedStepId:steps[i].id};
}

describe("stage 9 disk-backed client / mounted offline route / isolated PG",()=>{
  beforeAll(async()=>{
    const url=new URL(process.env.DATABASE_URL??"");
    const db=process.env.GAFUS_STAGE9_DB;
    expect(db).toMatch(/^stage9_offline_[a-f0-9]{12}$/);
    expect([url.protocol,url.hostname,url.port,url.username,url.pathname,url.search]).toEqual([
      "postgresql:","127.0.0.1",process.env.GAFUS_STAGE9_PORT,"qaoffline","/"+db,"?schema=public",
    ]);
    expect(process.env.GAFUS_STAGE9_DIR).toMatch(/^\/tmp\/gafus-offline-stage9\./);
    const rows=await prisma.$queryRaw<{db:string;usr:string}[]>`SELECT current_database() db,current_user usr`;
    expect(rows).toEqual([{db,usr:"qaoffline"}]);
    expect(await prisma.user.count()).toBe(0);
    for(const role of ["TRAINER","USER","USER"] as const){
      const user=await prisma.user.create({data:{username:"stage9-"+randomUUID(),password:"SYNTHETIC_NEVER_LOGIN",role,registrationPending:false}});
      if(role==="TRAINER")trainer=user.id;else if(!owner)owner=user.id;else other=user.id;
    }
    const video=await prisma.trainerVideo.create({data:{trainerId:trainer,relativePath:"synthetic.mp4",originalName:"synthetic.mp4",mimeType:"video/mp4",fileSize:100n}});
    videoId=video.id;
    const course=await prisma.course.create({data:{name:"Stage9 synthetic",type:"stage9-"+randomUUID(),duration:"1",trainingLevel:"BEGINNER",logoImg:"",authorId:trainer}});
    courseId=course.id;
    const day=await prisma.trainingDay.create({data:{title:"Stage9 day",authorId:trainer}});
    dayOnCourseId=(await prisma.dayOnCourse.create({data:{courseId,dayId:day.id,order:0}})).id;
    for(const [i,type] of (["TRAINING","THEORY","TRAINING"] as const).entries()){
      const step=await prisma.step.create({data:{authorId:trainer,title:"Stage9 "+i,type,durationSec:90,videoUrl:i===0?"/api/v1/video/"+videoId:null}});
      const link=await prisma.stepOnDay.create({data:{dayId:day.id,stepId:step.id,order:i}});
      steps.push({id:step.id,link:link.id});
    }
    const bundle=await prisma.dailyCourseBundle.create({data:{title:"Stage9 daily",authorId:trainer}});
    bundleStepId=(await prisma.dailyCourseBundleStep.create({data:{bundleId:bundle.id,stepId:steps[0].id,order:0}})).id;
    scheduleId=(await prisma.dailyCourseSchedule.create({data:{bundleId:bundle.id,createdById:trainer,date:new Date("2020-01-01T00:00:00Z")}})).id;
  });
  afterAll(async()=>{await prisma.$disconnect();});
  it("keeps ownerless old bytes and retries persisted step/timer/theory/daily/video after lost ACK",async()=>{
    const device=client("device-a");
    for(const [key,value] of Object.entries(legacy))await device.storage.setItem(key,value);
    let queue=device.open();
    const initial=await queue.beginVerifiedLogin(owner);
    await queue.enqueue("progress","startStep",{...stepPayload(0),durationSec:90,status:"IN_PROGRESS",offlineProgressVersion:"none"});
    await queue.enqueue("progress","pauseStep",{...stepPayload(0),timeLeftSec:70,offlineProgressVersion:"none"});
    await queue.enqueue("progress","completePracticeStep",stepPayload(0));
    await queue.enqueue("progress","completeTheoryStep",stepPayload(1));
    await queue.enqueue("progress","dailyCourseCompleteStep",{scheduleId,stepIndex:0,expectedBundleStepId:bundleStepId,expectedStepId:steps[0].id});
    await queue.videoSnapshot(videoId,initial,{lastPositionSec:0,progressVersion:"none"});
    await queue.enqueue("progress","saveVideoProgress",{videoId,positionSec:42,updatedAt:Date.now()});
    const ids=(await queue.getPending("progress")).map(e=>e.eventId);
    expect(ids).toHaveLength(6);
    for(const eventId of ids){
      queue=device.open(); // new runtime instance, file adapters re-read disk
      expect(await queue.restoreVerifiedSession(owner)).toBe(true);
      const binding=queue.getVerifiedBinding()!;
      const before=(await queue.getPending("progress")).map(e=>e.eventId);
      expect(before[0]).toBe(eventId);
      const send=transport(owner);
      await expect(replayProgressJournal(queue,binding,()=>true,async(r,current)=>{
        expect(r.body.eventId).toBe(eventId);
        const committed=await send(r,current) as {ack:{replayed:boolean}};
        expect(committed.ack.replayed).toBe(false);
        throw Error("TEST_LOST_ACK_AFTER_COMMIT");
      },()=>{},1)).rejects.toThrow("TEST_LOST_ACK_AFTER_COMMIT");
      expect(await prisma.offlineMutationReceipt.count({where:{ownerId:owner,eventId}})).toBe(1);
      const receiptPath="/api/v1/offline/mutations/"+eventId;
      const lookup=await app.request(receiptPath,{headers:{"x-stage9-actor":owner,"x-gafus-sync-protocol":"2"}});
      expect(lookup.status).toBe(200);
      expect(await lookup.json()).toMatchObject({ack:{eventId,replayed:true}});
      expect((await app.request(receiptPath,{headers:{"x-stage9-actor":other,"x-gafus-sync-protocol":"2"}})).status).toBe(404);
      const rewardCount=await prisma.gafusRewardEvent.count({where:{userId:owner}});
      queue=device.open();
      expect(await queue.restoreVerifiedSession(owner)).toBe(true);
      expect((await queue.getPending("progress")).map(e=>e.eventId)).toEqual(before);
      expect(await replayProgressJournal(queue,queue.getVerifiedBinding()!,()=>true,async(r,current)=>{
        const result=await send(r,current) as {ack:{replayed:boolean}};
        expect(result.ack.replayed).toBe(true);
        return result;
      },()=>{},1)).toMatchObject({committed:1});
      expect(await prisma.offlineMutationReceipt.count({where:{ownerId:owner,eventId}})).toBe(1);
      expect(await prisma.gafusRewardEvent.count({where:{userId:owner}})).toBe(rewardCount);
    }
    expect(await queue.getPending("progress")).toEqual([]);
    expect(await prisma.userStep.count({where:{userTraining:{userId:owner,dayOnCourseId},status:"COMPLETED"}})).toBe(2);
    expect(await prisma.dailyCourseUserStep.count({where:{dailyCourseUserTraining:{userId:owner,scheduleId},status:"COMPLETED"}})).toBe(1);
    expect(await prisma.userVideoProgress.findUnique({where:{userId_videoId:{userId:owner,videoId}}})).toMatchObject({lastPositionSec:42});
    await queue.endSession();
    expect(await queue.videoSnapshot(videoId,initial)).toBeNull();
    await queue.beginVerifiedLogin(other);
    expect(await queue.getPending("progress")).toEqual([]);
    for(const [key,value] of Object.entries(legacy))expect(await device.storage.getItem(key)).toBe(value);
  });
  it("fences owner change during ACK and two independent logical clients completing the same step",async()=>{
    const d1=client("client-one"),d2=client("client-two");
    const q1=d1.open(),q2=d2.open();
    const b1=await q1.beginVerifiedLogin(owner),b2=await q2.beginVerifiedLogin(owner);
    const e1=await q1.enqueue("progress","completePracticeStep",stepPayload(2));
    const e2=await q2.enqueue("progress","completePracticeStep",stepPayload(2));
    expect(e1.eventId).not.toBe(e2.eventId);
    const rewardBefore=await prisma.gafusRewardEvent.count({where:{userId:owner}});
    let completionCount=0;
    const send=transport(owner);
    const deliver:ProgressReplayTransport=async(r,current)=>{
      const body=await send(r,current) as {ack:{result:{stepJustCompleted:boolean}}};
      if(body.ack.result.stepJustCompleted)completionCount++;
      return body;
    };
    await Promise.all([
      replayProgressJournal(q1,b1,()=>true,async(r,current)=>{
        const reply=await deliver(r,current);
        await q1.endSession();
        await q1.beginVerifiedLogin(other);
        return reply;
      },()=>{},1),
      replayProgressJournal(q2,b2,()=>true,deliver,()=>{},1),
    ]);
    expect(completionCount).toBe(1);
    expect(await q1.getPending("progress")).toEqual([]);
    expect(await prisma.userStep.count({where:{userTraining:{userId:owner,dayOnCourseId},stepOnDayId:steps[2].link}})).toBe(1);
    expect(await prisma.userStep.count({where:{userTraining:{userId:other}}})).toBe(0);
    await q1.endSession();
    const returning=d1.open();
    const binding=await returning.beginVerifiedLogin(owner);
    expect((await returning.getPending("progress")).map(e=>e.eventId)).toEqual([e1.eventId]);
    expect(await replayProgressJournal(returning,binding,()=>true,send,()=>{},1)).toMatchObject({committed:1});
    expect(await prisma.offlineMutationReceipt.count({where:{ownerId:owner,eventId:{in:[e1.eventId,e2.eventId]}}})).toBe(2);
    expect(await prisma.gafusRewardEvent.count({where:{userId:owner}})).toBe(rewardBefore);
  });
  it("imports only an owned historical envelope and preserves stale bound events after trainer edits",async()=>{
    const d=client("historical");
    const oldEpoch=randomUUID(), oldEvent=randomUUID();
    const oldKey="gafus-progress-v2:"+other+":"+oldEpoch;
    const oldEntry={eventId:oldEvent,createdAt:Date.now()-60_000,kind:"completePracticeStep",payload:stepPayload(0)};
    await d.storage.setItem(oldKey,JSON.stringify({schemaVersion:2,principalId:other,authEpoch:oldEpoch,entries:[oldEntry]}));
    const q=d.open();
    await q.beginVerifiedLogin(owner);
    expect(await q.getPending("progress")).toEqual([]);
    expect(await d.storage.getItem(oldKey)).not.toBeNull();
    await q.endSession();
    const binding=await q.beginVerifiedLogin(other);
    expect(binding.authEpoch).not.toBe(oldEpoch);
    expect(await q.getPending("progress")).toEqual([oldEntry]);
    expect(await d.storage.getItem(oldKey)).toBeNull();
    expect(await replayProgressJournal(q,binding,()=>true,transport(other),()=>{},1)).toMatchObject({committed:1});
    expect(await prisma.offlineMutationReceipt.count({where:{ownerId:other,eventId:oldEvent}})).toBe(1);

    const stale=await q.enqueue("progress","completeTheoryStep",stepPayload(1));
    const replacement=await prisma.step.create({data:{authorId:trainer,title:"Edited by trainer",type:"THEORY"}});
    await prisma.stepOnDay.update({where:{id:steps[1].link},data:{stepId:replacement.id}});
    const restart=d.open();
    expect(await restart.restoreVerifiedSession(other)).toBe(true);
    const result=await replayProgressJournal(restart,restart.getVerifiedBinding()!,()=>true,async request=>{
      const response=await app.request(request.path,{method:"POST",headers:{
        ...request.headers,"content-type":"application/json","x-stage9-actor":other,"x-platform":"ANDROID",
      },body:JSON.stringify(request.body)});
      expect(response.status).toBe(409);
      return response.json();
    },()=>{},1);
    expect(result).toEqual({committed:0,pending:true});
    expect((await restart.getPending("progress")).map(e=>e.eventId)).toEqual([stale.eventId]);
    expect(await prisma.offlineMutationReceipt.count({where:{ownerId:other,eventId:stale.eventId}})).toBe(0);
    expect(await prisma.userStep.count({where:{userTraining:{userId:other},stepOnDayId:steps[1].link}})).toBe(0);
  });

});
