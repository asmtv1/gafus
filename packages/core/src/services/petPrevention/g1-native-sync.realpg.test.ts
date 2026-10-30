/** AG4 ACTIVE exclusive PG14 :55454. Real Core, Prisma, Postgres, synthetic owner/step fixtures.
 * NEVER touches historical native queues, production, migrations or other DBs. */
import {randomUUID} from "node:crypto";
import type {PrismaClient} from "@prisma/client";
import {beforeEach,afterEach,afterAll,describe,expect,it,vi} from "vitest";
const LEASE_DATABASE_URL="postgresql://native_sync_owner@127.0.0.1:55454/gafus_native_sync_ag1_20261017?schema=public";
const supplied=process.env.G1_NATIVE_REAL_PG_URL;
if(supplied && supplied!==LEASE_DATABASE_URL)throw Error("G1_NATIVE_DB_EXACT_LEASE_REQUIRED");
const m=vi.hoisted(()=>({barrierKey:"",finds:0,waiters:[] as (()=>void)[],injectAfterSecondCreate:false,creates:0,uniqueErrors:0}));
vi.mock("@gafus/prisma",async()=>{
 const {createRequire}=await import("node:module");const req=createRequire(new URL("../../../../prisma/package.json",import.meta.url));
 const p=req("@prisma/client");const raw=process.env.G1_NATIVE_REAL_PG_URL;
 if(!raw)return {prisma:{},Prisma:p.Prisma,TrainingStatus:p.TrainingStatus,isPrismaUniqueConstraintError:()=>false};
 if(raw!=="postgresql://native_sync_owner@127.0.0.1:55454/gafus_native_sync_ag1_20261017?schema=public")throw Error("Refusing any non-AG4 native SQL DB");
 const db=new p.PrismaClient({datasources:{db:{url:raw}}});
 const proxy=new Proxy(db,{get(target,key){
  if(key==="$transaction")return (fn:(tx:unknown)=>Promise<unknown>,opts?:unknown)=>target.$transaction(async(tx:unknown)=>{
   const wrapped=new Proxy(tx as object,{get(t,k){
    if(k==="petPreventionEntry")return new Proxy(Reflect.get(t,k),{get(d,field){
     if(field==="findUnique")return async(args:unknown)=>{
      const found=await d.findUnique(args);
      const lookup=args as {where?:{petId_clientId?:{clientId?:string}}};
      if(m.barrierKey&&lookup.where?.petId_clientId?.clientId===m.barrierKey&&m.finds<2){
       m.finds++;
       await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error("ISOLATED_BARRIER_TIMEOUT")),12000);
        m.waiters.push(()=>{clearTimeout(timer);resolve();});
        if(m.finds===2){const wake=m.waiters.splice(0);for(const go of wake)go();}
       });
      }
      return found;
     };
     if(field==="create")return async(args:unknown)=>{
      let made;
      try { made=await d.create(args); }
      catch(error){if((error as {code?:string})?.code==="P2002")m.uniqueErrors++;throw error;}
      m.creates++;
      if(m.injectAfterSecondCreate&&m.creates===2)throw Error("SYNTHETIC_FAILURE_AFTER_SECOND_ACTUAL_SQL_INSERT");
      return made;
     };
     const value=Reflect.get(d,field);return typeof value==="function"?value.bind(d):value;
    }});
    const value=Reflect.get(t,k);return typeof value==="function"?value.bind(t):value;
   }});
   return fn(wrapped);
  },opts as never);
  const val=Reflect.get(target,key);return typeof val==="function"?val.bind(target):val;
 }});
 return {prisma:proxy,Prisma:p.Prisma,TrainingStatus:p.TrainingStatus,isPrismaUniqueConstraintError:(e:unknown)=>e instanceof p.Prisma.PrismaClientKnownRequestError&&e.code==="P2002"};
});
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({info:vi.fn(),warn:vi.fn(),error:vi.fn(),success:vi.fn()})}));
import {prisma} from "@gafus/prisma";
import {upsertPreventionEntriesBatch} from "./petPreventionService";
import {sessionIsCurrent} from "../auth/identityReadService";
const db=prisma as PrismaClient;
const e=(clientId:string,productName="Original")=>({clientId,type:"VACCINATION" as const,performedAt:new Date("2026-10-16T12:00:00.000Z"),productName,reminderEnabled:false});
(supplied?describe:describe.skip)("AG4 native isolated PostgreSQL14 actual SQL Core owner/dedup/retry/rollback",()=>{
 let A="",B="",petA="",petB="",course="",day="",step="",link="",stepLink="";
 beforeEach(async()=>{
  A=randomUUID();B=randomUUID();petA=randomUUID();petB=randomUUID();course=randomUUID();day=randomUUID();step=randomUUID();link=randomUUID();stepLink=randomUUID();
  m.barrierKey="";m.finds=0;m.waiters=[];m.injectAfterSecondCreate=false;m.creates=0;m.uniqueErrors=0;
  await db.user.createMany({data:[
   {id:A,username:`g1-sync-${A}`,email:`g1-sync-${A}@example.test`,password:"SYNTHETIC"},
   {id:B,username:`g1-sync-${B}`,email:`g1-sync-${B}@example.test`,password:"SYNTHETIC"},
  ]});
  await db.pet.createMany({data:[
   {id:petA,ownerId:A,name:"SyntheticA",type:"DOG",breed:"Mixed",birthDate:new Date("2022-01-01")},
   {id:petB,ownerId:B,name:"SyntheticB",type:"DOG",breed:"Mixed",birthDate:new Date("2022-01-01")},
  ]});
  await db.course.create({data:{id:course,name:"SyntheticCourse",type:`g1-${course.slice(0,24)}`,trainingLevel:"BEGINNER",duration:"1",logoImg:"synthetic",authorId:A}});
  await db.trainingDay.create({data:{id:day,title:"SyntheticDay",authorId:A}});
  await db.step.create({data:{id:step,title:"SyntheticStep",type:"TRAINING",authorId:A}});
  await db.dayOnCourse.create({data:{id:link,courseId:course,dayId:day,order:0}});
  await db.stepOnDay.create({data:{id:stepLink,dayId:day,stepId:step,order:0}});
 });
 afterEach(async()=>{
  m.barrierKey="";m.injectAfterSecondCreate=false;
  const ids=[A,B];
  await db.petPreventionEntry.deleteMany({where:{ownerId:{in:ids}}});
  await db.userStep.deleteMany({where:{userTraining:{userId:{in:ids}}}});
  await db.userTraining.deleteMany({where:{userId:{in:ids}}});
  await db.stepOnDay.deleteMany({where:{id:stepLink}});
  await db.dayOnCourse.deleteMany({where:{id:link}});
  await db.step.deleteMany({where:{id:step}});
  await db.trainingDay.deleteMany({where:{id:day}});
  await db.course.deleteMany({where:{id:course}});
  await db.pet.deleteMany({where:{id:{in:[petA,petB]}}});
  await db.user.deleteMany({where:{id:{in:ids}}});
 });
 afterAll(async()=>{await db.$disconnect();});
 it("NSQL01 new+sequential identical replay is 1 SQL row, second ACK is UPDATE not no-write",async()=>{
  const key=randomUUID();const first=await upsertPreventionEntriesBatch(A,petA,[e(key)]);
  const old=await db.petPreventionEntry.findUniqueOrThrow({where:{petId_clientId:{petId:petA,clientId:key}}});
  const second=await upsertPreventionEntriesBatch(A,petA,[e(key)]);
  const latest=await db.petPreventionEntry.findUniqueOrThrow({where:{petId_clientId:{petId:petA,clientId:key}}});
  expect(first).toMatchObject({success:true,data:{created:1,updated:0,errors:[]}});
  expect(second).toMatchObject({success:true,data:{created:0,updated:1,errors:[]}});
  expect(latest.id).toBe(old.id);expect(await db.petPreventionEntry.count({where:{petId:petA}})).toBe(1);
 });
 it("NSQL02 conflicting payload SAME clientId overwrites previous SQL row; no 409/fingerprint",async()=>{
  const key=randomUUID();await upsertPreventionEntriesBatch(A,petA,[e(key)]);
  const r=await upsertPreventionEntriesBatch(A,petA,[e(key,"CHANGED_PAYLOAD")]);
  expect(r).toMatchObject({success:true,data:{created:0,updated:1,errors:[]}});
  const row=await db.petPreventionEntry.findUniqueOrThrow({where:{petId_clientId:{petId:petA,clientId:key}}});
  expect(row.productName).toBe("CHANGED_PAYLOAD");expect(await db.petPreventionEntry.count({where:{petId:petA}})).toBe(1);
 });
 it("NSQL03 owner A pet denies B, same key on B pet remains independent",async()=>{
  const key=randomUUID();await upsertPreventionEntriesBatch(A,petA,[e(key)]);
  expect(await upsertPreventionEntriesBatch(B,petA,[e(key,"CROSS_OWNER")])).toEqual({success:false,error:"Питомец не найден"});
  expect(await upsertPreventionEntriesBatch(B,petB,[e(key,"B_OWN_PET")])).toMatchObject({success:true,data:{created:1,updated:0}});
  const a=await db.petPreventionEntry.findUniqueOrThrow({where:{petId_clientId:{petId:petA,clientId:key}}});
  const b=await db.petPreventionEntry.findUniqueOrThrow({where:{petId_clientId:{petId:petB,clientId:key}}});
  expect(a.ownerId).toBe(A);expect(a.productName).toBe("Original");expect(b.ownerId).toBe(B);
 });
 it("NSQL04 controlled dual SQL transaction insert collision: one success + one nonACK; exactly one row",async()=>{
  const key=randomUUID();m.barrierKey=key;
  const r=await Promise.all([upsertPreventionEntriesBatch(A,petA,[e(key)]),upsertPreventionEntriesBatch(A,petA,[e(key)])]);
  expect(r.filter(x=>x.success)).toHaveLength(1);expect(r.filter(x=>!x.success)).toHaveLength(1);
  expect(await db.petPreventionEntry.count({where:{petId:petA,clientId:key}})).toBe(1);
  expect(m.finds).toBe(2);expect(m.uniqueErrors).toBe(1);
 });
 it("NSQL05 concurrent conflicting payload same UUID: one insert one nonACK, winner data; no 409",async()=>{
  const key=randomUUID();m.barrierKey=key;
  const r=await Promise.all([upsertPreventionEntriesBatch(A,petA,[e(key,"ALPHA")]),upsertPreventionEntriesBatch(A,petA,[e(key,"BETA")])]);
  expect(r.filter(x=>x.success)).toHaveLength(1);expect(r.filter(x=>!x.success)).toHaveLength(1);
  const rows=await db.petPreventionEntry.findMany({where:{petId:petA,clientId:key}});expect(rows).toHaveLength(1);
  expect(["ALPHA","BETA"]).toContain(rows[0]?.productName);
  expect(m.uniqueErrors).toBe(1);
 });
 it("NSQL06 synthetic throw after second actual SQL INSERT rolls back ENTIRE batch",async()=>{
  m.creates=0;m.injectAfterSecondCreate=true;
  const r=await upsertPreventionEntriesBatch(A,petA,[e(randomUUID(),"FIRST"),e(randomUUID(),"SECOND")]);
  expect(r.success).toBe(false);expect(m.creates).toBe(2);
  expect(await db.petPreventionEntry.count({where:{petId:petA}})).toBe(0);
 });
 it("NSQL07 real session epoch revocation does not bind legacy queued clientId",async()=>{
  const stale=Date.now()-1000;expect(await sessionIsCurrent({sub:A,authenticatedAt:stale})).toBe(true);
  await db.user.update({where:{id:A},data:{sessionsRevokedAt:new Date()}});
  expect(await sessionIsCurrent({sub:A,authenticatedAt:stale})).toBe(false);
  const key=randomUUID();const result=await upsertPreventionEntriesBatch(A,petA,[e(key)]);
  expect(result.success).toBe(true);
  expect(await db.petPreventionEntry.count({where:{petId:petA,clientId:key}})).toBe(1);
  // Core receives only userId and petId; session check occurs OUTSIDE Core HTTP middleware.
  // This is NOT permission to replay this clientId from an unknown legacy queue.
 });
 it("NSQL08 progress real step create, same complete retry loses stepJustCompleted; status row unique",async()=>{
  // Vite import query breaks a pre-existing training-service circular-init partial-export
  // in this isolated Vitest harness; runs original source, not copied algorithm.
  // @ts-expect-error Vitest/Vite query suffix is resolved at runtime.
  const {updateStepAndDay}=await import("../training/trainingService.ts?g1_native_real_source_verify");
  const started=await updateStepAndDay(A,link,0,{type:"start",remainingSec:30});
  const first=await updateStepAndDay(A,link,0,{type:"complete"});
  const retry=await updateStepAndDay(A,link,0,{type:"complete"});
  expect(started.courseId).toBe(course);expect(first.stepJustCompleted).toBe(true);
  expect(retry.stepJustCompleted).toBe(false);
  const training=await db.userTraining.findUniqueOrThrow({where:{userId_dayOnCourseId:{userId:A,dayOnCourseId:link}}});
  const row=await db.userStep.findMany({where:{userTrainingId:training.id,stepOnDayId:stepLink}});
  expect(row).toHaveLength(1);expect(row[0]?.status).toBe("COMPLETED");
  expect(await db.userTraining.count({where:{userId:B,dayOnCourseId:link}})).toBe(0);
 });
 it("NSQL09 progress stale pause after complete rejects INVALID_STATE; no event-key ACK",async()=>{
  // @ts-expect-error Vitest/Vite query suffix is resolved at runtime.
  const {updateStepAndDay}=await import("../training/trainingService.ts?g1_native_real_source_verify");
  await updateStepAndDay(A,link,0,{type:"start",remainingSec:30});
  await updateStepAndDay(A,link,0,{type:"complete"});
  await expect(updateStepAndDay(A,link,0,{type:"pause",remainingSec:10})).rejects.toThrow("INVALID_STATE");
  const row=await db.userStep.findFirstOrThrow({where:{userTraining:{userId:A},stepOnDayId:stepLink}});
  expect(row.status).toBe("COMPLETED");
 });
});
