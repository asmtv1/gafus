/** AG1/AG4 supplemental real PG progress concurrency and SQL rollback on ACTIVE AG4 55454.
 * Disposable synthetic fixtures only; NO historical native events, real auth/JWT,
 * rewards, migrations, providers, other database, or production writes.
 */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LEASE_DATABASE_URL =
  "postgresql://native_sync_owner@127.0.0.1:55454/gafus_native_sync_ag1_20261017?schema=public";
const supplied = process.env.G1_NATIVE_REAL_PG_URL;
if (supplied && supplied !== LEASE_DATABASE_URL) throw Error("G1_NATIVE_DB_EXACT_LEASE_REQUIRED");
const m = vi.hoisted(() => ({ injectUserTrainingFailure: false, sqlStepWritesBeforeAbort: 0 }));
vi.mock("@gafus/prisma", async () => {
  const { createRequire } = await import("node:module");
  const req = createRequire(new URL("../../../../prisma/package.json", import.meta.url));
  const pkg = req("@prisma/client");
  const url = process.env.G1_NATIVE_REAL_PG_URL;
  if (!url) return { prisma: {}, Prisma: pkg.Prisma, TrainingStatus: pkg.TrainingStatus, isPrismaUniqueConstraintError: () => false };
  if (url !== "postgresql://native_sync_owner@127.0.0.1:55454/gafus_native_sync_ag1_20261017?schema=public") throw Error("OTHER_DATABASE_FORBIDDEN");
  const db = new pkg.PrismaClient({ datasources: { db: { url } } });
  const proxy = new Proxy(db, {
    get(target, key) {
      if (key === "$transaction") {
        return (callback: (tx: unknown) => Promise<unknown>, options?: unknown) =>
          target.$transaction(async (tx: unknown) => {
            const intercepted = new Proxy(tx as object, {
              get(t, field) {
                if (field === "userStep") {
                  return new Proxy(Reflect.get(t, field), {
                    get(delegate, op) {
                      if (op === "updateMany") return async (args: unknown) => {
                        const result = await delegate.updateMany(args);
                        if (m.injectUserTrainingFailure && result.count > 0) m.sqlStepWritesBeforeAbort += result.count;
                        return result;
                      };
                      const value = Reflect.get(delegate, op);
                      return typeof value === "function" ? value.bind(delegate) : value;
                    },
                  });
                }
                if (field === "userTraining") {
                  return new Proxy(Reflect.get(t, field), {
                    get(delegate, op) {
                      if (op === "update") return async (args: unknown) => {
                        if (m.injectUserTrainingFailure) throw Error("SYNTHETIC_FAILURE_AFTER_ACTUAL_SQL_USERSTEP_UPDATE");
                        return delegate.update(args);
                      };
                      const value = Reflect.get(delegate, op);
                      return typeof value === "function" ? value.bind(delegate) : value;
                    },
                  });
                }
                const value = Reflect.get(t, field);
                return typeof value === "function" ? value.bind(t) : value;
              },
            });
            return callback(intercepted);
          }, options as never);
      }
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { prisma: proxy, Prisma: pkg.Prisma, TrainingStatus: pkg.TrainingStatus,
    isPrismaUniqueConstraintError: (err: unknown) => err instanceof pkg.Prisma.PrismaClientKnownRequestError && err.code === "P2002" };
});
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }) }));
import { prisma } from "@gafus/prisma";
const db = prisma as PrismaClient;
// This bypasses existing circular-init partial exports in this isolated Vitest harness;
// it executes the ORIGINAL source trainingService.ts, not a copied or mocked algorithm.
async function realProgress() {
  // @ts-expect-error Vite query suffix resolved only by the test module loader.
  return (await import("./trainingService.ts?g1_native_progress_concurrency_actual_core")).updateStepAndDay;
}
(supplied ? describe : describe.skip)("AG4 native isolated PG14 progress concurrent and transactional rollback", () => {
  let owner="", foreign="", course="", day="", step="", dayLink="", stepLink="";
  beforeEach(async () => {
    owner=randomUUID();foreign=randomUUID();course=randomUUID();day=randomUUID();step=randomUUID();dayLink=randomUUID();stepLink=randomUUID();
    m.injectUserTrainingFailure=false;m.sqlStepWritesBeforeAbort=0;
    await db.user.createMany({data:[
      {id:owner,username:`g1-con-${owner}`,email:`g1-con-${owner}@example.test`,password:"SYNTHETIC_ONLY"},
      {id:foreign,username:`g1-con-${foreign}`,email:`g1-con-${foreign}@example.test`,password:"SYNTHETIC_ONLY"},
    ]});
    await db.course.create({data:{id:course,name:"SyntheticConcurrency",type:`g1-c-${course.slice(0,24)}`,trainingLevel:"BEGINNER",duration:"1",logoImg:"synthetic",authorId:owner}});
    await db.trainingDay.create({data:{id:day,title:"SyntheticTraining",authorId:owner}});
    await db.step.create({data:{id:step,title:"SyntheticStep",type:"TRAINING",authorId:owner}});
    await db.dayOnCourse.create({data:{id:dayLink,courseId:course,dayId:day,order:0}});
    await db.stepOnDay.create({data:{id:stepLink,dayId:day,stepId:step,order:0}});
  });
  afterEach(async () => {
    m.injectUserTrainingFailure=false;
    if (owner && foreign) {
      await db.userStep.deleteMany({where:{userTraining:{userId:{in:[owner,foreign]}}}});
      await db.userTraining.deleteMany({where:{userId:{in:[owner,foreign]}}});
      await db.stepOnDay.deleteMany({where:{id:stepLink}});
      await db.dayOnCourse.deleteMany({where:{id:dayLink}});
      await db.step.deleteMany({where:{id:step}});
      await db.trainingDay.deleteMany({where:{id:day}});
      await db.course.deleteMany({where:{id:course}});
      await db.user.deleteMany({where:{id:{in:[owner,foreign]}}});
    }
  });
  afterAll(async () => { await db.$disconnect(); });

  it("NSQL10 two truly concurrent complete requests after start commit at most one first-completion effect", async () => {
    const mutate=await realProgress();
    await mutate(owner,dayLink,0,{type:"start",remainingSec:40});
    const results=await Promise.allSettled([
      mutate(owner,dayLink,0,{type:"complete"}),
      mutate(owner,dayLink,0,{type:"complete"}),
    ]);
    const accepted=results.filter((r):r is PromiseFulfilledResult<Awaited<ReturnType<typeof mutate>>>=>r.status==="fulfilled").map(r=>r.value);
    expect(accepted.filter(r=>r.stepJustCompleted)).toHaveLength(1);
    // A rejected concurrent result has NO ACK even if another committed.
    const rows=await db.userStep.findMany({where:{userTraining:{userId:owner},stepOnDayId:stepLink}});
    expect(rows).toHaveLength(1);expect(rows[0]?.status).toBe("COMPLETED");
    expect(await db.userStep.count({where:{userTraining:{userId:foreign}}})).toBe(0);
  });
  it("NSQL11 injected failure AFTER real SQL step UPDATE rolls back step, day, progress on same transaction", async () => {
    const mutate=await realProgress();
    await mutate(owner,dayLink,0,{type:"start",remainingSec:40});
    const original=await db.userStep.findFirstOrThrow({where:{userTraining:{userId:owner},stepOnDayId:stepLink}});
    const initialTraining=await db.userTraining.findUniqueOrThrow({where:{userId_dayOnCourseId:{userId:owner,dayOnCourseId:dayLink}}});
    m.injectUserTrainingFailure=true;
    await expect(mutate(owner,dayLink,0,{type:"complete"})).rejects.toThrow("SYNTHETIC_FAILURE_AFTER_ACTUAL_SQL_USERSTEP_UPDATE");
    expect(m.sqlStepWritesBeforeAbort).toBe(1);
    m.injectUserTrainingFailure=false;
    const rollbackRow=await db.userStep.findUniqueOrThrow({where:{id:original.id}});
    const rollbackTraining=await db.userTraining.findUniqueOrThrow({where:{id:initialTraining.id}});
    expect(rollbackRow.status).toBe("IN_PROGRESS");
    expect(rollbackRow.remainingSec).toBe(40);
    expect(rollbackTraining.status).toBe(initialTraining.status);
    expect(rollbackTraining.currentStepIndex).toBe(initialTraining.currentStepIndex);
    const actual=await mutate(owner,dayLink,0,{type:"complete"});
    expect(actual.stepJustCompleted).toBe(true);
    expect(await db.userStep.count({where:{userTrainingId:initialTraining.id}})).toBe(1);
  });
  it("NSQL12 legitimate RESET permits second complete and second stepJustCompleted true; NOT forever-once reward proof", async () => {
    const mutate=await realProgress();
    await mutate(owner,dayLink,0,{type:"start",remainingSec:25});
    const first=await mutate(owner,dayLink,0,{type:"complete"});
    const reset=await mutate(owner,dayLink,0,{type:"reset"});
    const second=await mutate(owner,dayLink,0,{type:"complete"});
    expect(first.stepJustCompleted).toBe(true);
    expect(reset.stepJustCompleted).toBe(false);
    expect(second.stepJustCompleted).toBe(true);
    const rows=await db.userStep.findMany({where:{userTraining:{userId:owner},stepOnDayId:stepLink}});
    expect(rows).toHaveLength(1);expect(rows[0]?.status).toBe("COMPLETED");
    // No grant/reward service or event fingerprint was executed.
  });
  it("NSQL13 distinct authenticated Core userIds persist strictly separate UserTraining and UserStep records", async () => {
    const mutate=await realProgress();
    await mutate(owner,dayLink,0,{type:"start",remainingSec:20});
    await mutate(foreign,dayLink,0,{type:"start",remainingSec:90});
    const a=await db.userTraining.findUniqueOrThrow({where:{userId_dayOnCourseId:{userId:owner,dayOnCourseId:dayLink}}});
    const b=await db.userTraining.findUniqueOrThrow({where:{userId_dayOnCourseId:{userId:foreign,dayOnCourseId:dayLink}}});
    expect(a.id).not.toBe(b.id);
    const aStep=await db.userStep.findFirstOrThrow({where:{userTrainingId:a.id}});
    const bStep=await db.userStep.findFirstOrThrow({where:{userTrainingId:b.id}});
    expect(aStep.remainingSec).toBe(20);expect(bStep.remainingSec).toBe(90);
    // Core accepts supplied userId; entitlement/actual signed JWT is enforced by separate Hono layers, NOT proven here.
  });
});
