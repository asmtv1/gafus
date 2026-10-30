/** Opt-in real PG test, with schema-only synthetic fixture database.
 * The owning runner checks database identity and drops only its new database.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { findNewOfflineMutationReceipt, submitNewOfflinePracticeMutation } from "./offlineMutationJournal";

const DB = "gafus_refactor_offline_accept_20261026_g1";
const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const enabled = process.env.GAFUS_OFFLINE_ISOLATED_ACCEPT === "1";
const actor: string[] = [];
let courseId = "", dayOnCourseId = "";
const links: string[] = [];
const ownPrefix = "g1_offline_" + randomUUID().slice(0, 8);
const payload = (ownerId: string, eventId: string, stepIndex = 0, course = courseId) => ({
  ownerId, eventId, courseId: course, dayOnCourseId, stepIndex,
  operation: "training.complete.practice" as const,
});
const testScope = enabled ? describe : describe.skip;

testScope("OFF021 V2 exact-once isolated PG acceptance", () => {
  beforeAll(async () => {
    const u = new URL(process.env.DATABASE_URL ?? "");
    expect([u.protocol,u.hostname,u.port,u.pathname,u.username,u.search]).toEqual([
      "postgresql:", "127.0.0.1", "55921", "/" + DB,
      "gafus_refactor_local_real", "?schema=public",
    ]);
    expect(process.env.GAFUS_OFFLINE_ISOLATED_ROOT).toBe(ROOT);
    const rows = await prisma.$queryRawUnsafe<{
      db:string; username:string; version:string; receipt:string|null; revision:string|null;
    }[]>("SELECT current_database() db,current_user username,"+
      "current_setting('server_version_num') version,"+
      "to_regclass('public.\"OfflineMutationReceipt\"')::text receipt,"+
      "to_regclass('public.\"OfflineResourceRevision\"')::text revision");
    expect(rows).toEqual([{
      db:DB,username:"gafus_refactor_local_real",version:"180004",
      receipt:"\"OfflineMutationReceipt\"",revision:"\"OfflineResourceRevision\"",
    }]);
    const trainer = await prisma.user.create({data:{
      username:ownPrefix+"_trainer",password:"SYNTHETIC_NEVER_LOGIN",
      role:"TRAINER",registrationPending:false,
    }});
    const a = await prisma.user.create({data:{
      username:ownPrefix+"_alice",password:"SYNTHETIC_NEVER_LOGIN",
      role:"USER",registrationPending:false,
    }});
    const b = await prisma.user.create({data:{
      username:ownPrefix+"_bob",password:"SYNTHETIC_NEVER_LOGIN",
      role:"USER",registrationPending:false,
    }});
    actor.push(a.id,b.id);
    const course = await prisma.course.create({data:{
      name:"Isolated offline course",type:ownPrefix,duration:"1",
      trainingLevel:"BEGINNER",logoImg:"",authorId:trainer.id,
    }});
    courseId=course.id;
    const day=await prisma.trainingDay.create({data:{
      title:"Isolated day",authorId:trainer.id,
    }});
    const doc=await prisma.dayOnCourse.create({data:{
      courseId,dayId:day.id,order:0,
    }});
    dayOnCourseId=doc.id;
    for(let i=0;i<2;i++){
      const step=await prisma.step.create({data:{
        authorId:trainer.id,title:"Isolated practice "+i,type:"TRAINING",durationSec:60,
      }});
      const link=await prisma.stepOnDay.create({data:{
        dayId:day.id,stepId:step.id,order:i,
      }});
      links.push(link.id);
    }
  },30000);
  afterAll(async()=>{await prisma.$disconnect();},30000);

  it("commit, readback and same-event replay preserve one receipt/step",async()=>{
    const id=randomUUID(),a=actor[0];
    const first=await submitNewOfflinePracticeMutation(payload(a,id));
    expect(first.ack).toMatchObject({
      state:"COMMITTED",protocol:2,replayed:false,serverRevision:"1",
      result:{courseId,stepJustCompleted:true,allCompleted:false},
    });
    expect((await submitNewOfflinePracticeMutation(payload(a,id))).ack)
      .toMatchObject({replayed:true,serverRevision:"1"});
    expect((await findNewOfflineMutationReceipt(a,id))?.ack.replayed).toBe(true);
    expect(await prisma.offlineMutationReceipt.count({where:{ownerId:a,eventId:id}})).toBe(1);
    expect(await prisma.userStep.count({where:{
      userTraining:{userId:a,dayOnCourseId},stepOnDayId:links[0],
    }})).toBe(1);
  });

  it("same id with another step is a conflict and never mutates that step",async()=>{
    const a=actor[0],id=randomUUID();
    await submitNewOfflinePracticeMutation(payload(a,id));
    await expect(submitNewOfflinePracticeMutation(payload(a,id,1)))
      .rejects.toMatchObject({code:"IDEMPOTENCY_KEY_CONFLICT"});
    expect(await prisma.offlineMutationReceipt.count({where:{ownerId:a,eventId:id}})).toBe(1);
    expect(await prisma.userStep.count({where:{
      userTraining:{userId:a,dayOnCourseId},stepOnDayId:links[1],
    }})).toBe(0);
  });

  it("owner-scoped lookup never returns another user's receipt",async()=>{
    const id=randomUUID(),[a,b]=actor;
    await submitNewOfflinePracticeMutation(payload(a,id));
    expect(await findNewOfflineMutationReceipt(b,id)).toBeNull();
    expect((await submitNewOfflinePracticeMutation(payload(b,id))).ack.replayed).toBe(false);
    expect(await prisma.offlineMutationReceipt.count({where:{eventId:id}})).toBe(2);
  });

  it("wrong-course request rolls back progress and receipt",async()=>{
    const id=randomUUID(),a=actor[0];
    const before=await prisma.userStep.count({where:{
      userTraining:{userId:a,dayOnCourseId},stepOnDayId:links[1],
    }});
    await expect(submitNewOfflinePracticeMutation(
      payload(a,id,1,"clwrongcourse000000000000"),
    )).rejects.toThrow("COURSE_DAY_MISMATCH");
    expect(await findNewOfflineMutationReceipt(a,id)).toBeNull();
    expect(await prisma.userStep.count({where:{
      userTraining:{userId:a,dayOnCourseId},stepOnDayId:links[1],
    }})).toBe(before);
  });

  it("two concurrent identical events yield one commit and one replay",async()=>{
    const a=actor[0],id=randomUUID();
    const receipts=await Promise.all([
      submitNewOfflinePracticeMutation(payload(a,id,1)),
      submitNewOfflinePracticeMutation(payload(a,id,1)),
    ]);
    expect(receipts.map(x=>x.ack.replayed).sort()).toEqual([false,true]);
    expect(new Set(receipts.map(x=>x.ack.serverRevision)).size).toBe(1);
    expect(await prisma.offlineMutationReceipt.count({where:{ownerId:a,eventId:id}})).toBe(1);
  });
});
