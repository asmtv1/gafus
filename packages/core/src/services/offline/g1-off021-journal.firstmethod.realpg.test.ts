/** OFF021 first v2 training.complete.practice: *real* PG/Prisma acceptance
 * on AG4 exclusive journal SQL lease ONLY AFTER AG4 applies approved additive DDL.
 * No Prisma CLI/generate/DDL, no historical queues and no external providers.
 * RUN OPT-IN requires exact dedicated AG4 lease JSON and test DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readFileSync, lstatSync, realpathSync } from "node:fs";
import { beforeAll, afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@gafus/prisma";
import {
  submitNewOfflinePracticeMutation,
  findNewOfflineMutationReceipt,
} from "./offlineMutationJournal";
// Vitest's existing Core -> Course -> Offline ESM cycle exposes partial exports.
// Resolve a separately-evaluated copy of the REAL current trainingService source;
// no Core SQL delegate is mocked or replaced, same Prisma client and TX used.
vi.mock("../training/trainingService", async () => {
  // @ts-expect-error Vite query suffix is supported by the test module loader only.
  return import("../training/trainingService.ts?g1_off021_real_core");
});
import { updateStepAndDay } from "../training/trainingService";
const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const URL =
  "postgresql://off021_journal_owner@127.0.0.1:55455/gafus_off021_journal_ag1_20261017?schema=public";
const LEASE =
  ROOT +
  "/apps/admin-panel/.ag4-off021-journal-pg-20261017/AG4_AG1_OFF021_JOURNAL_ACTIVE_PG_LEASE.v1.json";
const RUN =
  process.env.AG1_OFF021_JOURNAL_PG_URL === URL &&
  process.env.AG1_OFF021_JOURNAL_LEASE_FILE === LEASE &&
  process.env.DATABASE_URL === URL;
if (
  [process.env.AG1_OFF021_JOURNAL_PG_URL, process.env.AG1_OFF021_JOURNAL_LEASE_FILE].some(
    Boolean,
  ) &&
  !RUN
)
  throw Error("OFF021_EXACT_AG4_NEW_DB_LEASE_AND_DATABASE_URL_REQUIRED");
const db = prisma as PrismaClient;
const captureDir = ROOT + "/apps/api/.g1-off021-journal-pg55-ag1-20261017/captures";
const captureEnabled =
  process.env.AG1_OFF021_REALPG_CAPTURE_DIR === captureDir &&
  process.env.TMPDIR?.startsWith(ROOT + "/apps/api/.g1-off021-journal-pg55-ag1-20261017/tmp/");
(RUN ? describe : describe.skip)(
  "AG4 real PG55 first v2 journal source JPC01-JPC08 (NOT full JTX13)",
  () => {
    let A = "",
      B = "",
      course = "",
      day = "",
      step1 = "",
      step2 = "",
      link = "",
      sl1 = "",
      sl2 = "";
    const req = (eventId = randomUUID(), stepIndex = 0, courseId = course, ownerId = A) => ({
      ownerId,
      eventId,
      operation: "training.complete.practice" as const,
      courseId,
      dayOnCourseId: link,
      stepIndex,
    });
    beforeAll(async () => {
      if (lstatSync(LEASE).isSymbolicLink() || realpathSync(LEASE) !== LEASE)
        throw Error("AG4_JOURNAL_LEASE_SYMLINK");
      const lease = JSON.parse(readFileSync(LEASE, "utf8"));
      if (
        lease.state !== "ACTIVE_AG1_OFF021_JOURNAL_SQL_ONLY" ||
        lease.root !== ROOT ||
        lease.branch !== "vite" ||
        lease.executor !== "AG1" ||
        lease.port !== 55455 ||
        lease.database !== "gafus_off021_journal_ag1_20261017" ||
        Date.parse(lease.expiresAtUTC) <= Date.now()
      )
        throw Error("AG4_JOURNAL_LEASE_INACTIVE");
      const identity = await db.$queryRaw<
        {
          db: string;
          actor: string;
          pgport: number;
          receipt: string | null;
          revision: string | null;
        }[]
      >`
    SELECT current_database() AS db,current_user AS actor,inet_server_port() AS pgport,
    to_regclass('public."OfflineMutationReceipt"')::text AS receipt,
    to_regclass('public."OfflineResourceRevision"')::text AS revision`;
      if (
        identity[0]?.db !== "gafus_off021_journal_ag1_20261017" ||
        identity[0]?.actor !== "off021_journal_owner" ||
        identity[0]?.pgport !== 55455 ||
        !identity[0]?.receipt ||
        !identity[0]?.revision
      )
        throw Error("AG4_HAS_NOT_APPLIED_AND_VERIFIED_ADDITIVE_JOURNAL_DDL");
    }, 30000);
    beforeEach(async () => {
      A = randomUUID();
      B = randomUUID();
      course = randomUUID();
      day = randomUUID();
      step1 = randomUUID();
      step2 = randomUUID();
      link = randomUUID();
      sl1 = randomUUID();
      sl2 = randomUUID();
      await db.user.createMany({
        data: [
          {
            id: A,
            username: `jpc-${A}`,
            email: `jpc-${A}@example.test`,
            password: "SYNTHETIC_ONLY",
          },
          {
            id: B,
            username: `jpc-${B}`,
            email: `jpc-${B}@example.test`,
            password: "SYNTHETIC_ONLY",
          },
        ],
      });
      await db.course.create({
        data: {
          id: course,
          name: "JPC Synthetic",
          type: `jpc-${course.slice(0, 24)}`,
          trainingLevel: "BEGINNER",
          duration: "1",
          logoImg: "synthetic",
          authorId: A,
        },
      });
      await db.trainingDay.create({ data: { id: day, title: "JPC Synthetic", authorId: A } });
      await db.step.createMany({
        data: [
          { id: step1, title: "JPC 1", type: "TRAINING", authorId: A },
          { id: step2, title: "JPC 2", type: "TRAINING", authorId: A },
        ],
      });
      await db.dayOnCourse.create({ data: { id: link, courseId: course, dayId: day, order: 0 } });
      await db.stepOnDay.createMany({
        data: [
          { id: sl1, dayId: day, stepId: step1, order: 0 },
          { id: sl2, dayId: day, stepId: step2, order: 1 },
        ],
      });
    });
    afterEach(async (context) => {
      // JSON capture is strictly opt-in and project-local; only synthetic rows
      // from this test's owner UUIDs, never connection strings or real content.
      try {
        const caseCode = context.task.name.match(/JPC(\d\d)\/JTX(\d\d)/);
        if (captureEnabled && caseCode) {
          const receipts = await db.$queryRaw<
            { eventId: string; operation: string; state: string; revision: string }[]
          >`
            SELECT "eventId"::text AS "eventId","operation","state","revision"::text AS "revision"
            FROM "OfflineMutationReceipt" WHERE "ownerId" IN (${A},${B}) ORDER BY "eventId"`;
          const steps = await db.userStep.findMany({
            where: { userTraining: { userId: { in: [A, B] } } },
            select: { status: true, remainingSec: true, stepOnDayId: true },
            orderBy: { stepOnDayId: "asc" },
          });
          const revs = await db.$queryRaw<{ resourceKey: string; revision: string }[]>`
            SELECT "resourceKey","revision"::text AS "revision"
            FROM "OfflineResourceRevision" WHERE "ownerId" IN (${A},${B})`;
          const rewards = await db.$queryRaw<{ n: bigint }[]>`
            SELECT COUNT(*) AS n FROM "GafusRewardEvent" WHERE "userId" IN (${A},${B})`;
          const effects = await db.$queryRaw<{ n: bigint }[]>`
            SELECT COUNT(*) AS n FROM "OfflineMutationEffect" WHERE "ownerId" IN (${A},${B})`;
          mkdirSync(captureDir, { recursive: true });
          writeFileSync(
            join(captureDir, `JPC${caseCode[1]}-JTX${caseCode[2]}.json`),
            JSON.stringify(
              {
                caseId: `JTX${caseCode[2]}`,
                testName: context.task.name,
                provenance:
                  "REAL_AG4_PG14_PRISMA_SQL_LOCALHOST_55455_SAME_TX_NO_MOCKED_JOURNAL_OR_PROGRESS",
                actualSql: true,
                newlyAppliedTablesUsed: true,
                method: "training.complete.practice",
                syntheticOwnerA: A,
                syntheticOwnerB: B,
                receipts,
                steps,
                resourceRevisions: revs,
                gafusRewardEvents: Number(rewards[0]?.n ?? 0),
                scheduledEffects: Number(effects[0]?.n ?? 0),
              },
              null,
              2,
            ) + "\n",
            { flag: "wx" },
          );
        }
      } finally {
        await db.$executeRaw`DELETE FROM "OfflineMutationReceipt" WHERE "ownerId" IN (${A},${B})`;
        await db.$executeRaw`DELETE FROM "OfflineResourceRevision" WHERE "ownerId" IN (${A},${B})`;
        await db.userStep.deleteMany({ where: { userTraining: { userId: { in: [A, B] } } } });
        await db.userTraining.deleteMany({ where: { userId: { in: [A, B] } } });
        await db.userCourse.deleteMany({ where: { userId: { in: [A, B] } } });
        await db.stepOnDay.deleteMany({ where: { id: { in: [sl1, sl2] } } });
        await db.dayOnCourse.deleteMany({ where: { id: link } });
        await db.step.deleteMany({ where: { id: { in: [step1, step2] } } });
        await db.trainingDay.deleteMany({ where: { id: day } });
        await db.course.deleteMany({ where: { id: course } });
        await db.user.deleteMany({ where: { id: { in: [A, B] } } });
      }
    });
    afterAll(async () => {
      await db.$disconnect();
    });
    it("JPC01/JTX01 first COMMITTED ACK + identical sequential replay creates one real UserStep and one receipt", async () => {
      const input = req(),
        first = await submitNewOfflinePracticeMutation(input),
        second = await submitNewOfflinePracticeMutation(input);
      expect(first.ack).toMatchObject({
        state: "COMMITTED",
        replayed: false,
        eventId: input.eventId,
        serverRevision: "1",
      });
      expect(second.ack).toMatchObject({
        eventId: input.eventId,
        replayed: true,
        serverRevision: "1",
      });
      expect(await db.userStep.count({ where: { userTraining: { userId: A } } })).toBe(1);
      const receipts = await db.$queryRaw<
        { n: bigint }[]
      >`SELECT COUNT(*) AS n FROM "OfflineMutationReceipt" WHERE "ownerId"=${A}`;
      expect(Number(receipts[0]?.n)).toBe(1);
    });
    it("JPC02/JTX02 changed stepIndex same eventId gives conflict with no new Core mutation", async () => {
      const input = req();
      await submitNewOfflinePracticeMutation(input);
      await expect(
        submitNewOfflinePracticeMutation({ ...input, stepIndex: 1 }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
      expect(await db.userStep.count({ where: { userTraining: { userId: A } } })).toBe(1);
    });
    it("JPC09/JTX03 stored UUID rejects an altered operation, no new mutation", async () => {
      const original = req();
      await submitNewOfflinePracticeMutation(original);
      const forged = { ...original, operation: "training.reset" } as unknown as typeof original;
      await expect(submitNewOfflinePracticeMutation(forged)).rejects.toMatchObject({
        code: "IDEMPOTENCY_KEY_CONFLICT",
      });
      expect(await db.userStep.count({ where: { userTraining: { userId: A } } })).toBe(1);
    });
    it("JPC03/JTX04 concurrent identical inputs on real PostgreSQL: exactly one first ACK and one replay", async () => {
      const input = req();
      const out = await Promise.all([
        submitNewOfflinePracticeMutation(input),
        submitNewOfflinePracticeMutation(input),
      ]);
      expect(out.map((x) => x.ack.replayed).sort()).toEqual([false, true]);
      expect(await db.userStep.count({ where: { userTraining: { userId: A } } })).toBe(1);
    });
    it("JPC04/JTX05 two concurrent different valid stepIndex under same eventId: one commit and one conflict", async () => {
      const input = req();
      const out = await Promise.allSettled([
        submitNewOfflinePracticeMutation(input),
        submitNewOfflinePracticeMutation({ ...input, stepIndex: 1 }),
      ]);
      expect(out.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const rejected = out.find((x) => x.status === "rejected");
      expect(rejected).toMatchObject({
        status: "rejected",
        reason: { code: "IDEMPOTENCY_KEY_CONFLICT" },
      });
      expect(await db.userStep.count({ where: { userTraining: { userId: A } } })).toBe(1);
    });
    it("JPC05/JTX06 real SQL step UPDATE rolls back existing IN_PROGRESS row and receipt on wrong course", async () => {
      await updateStepAndDay(A, link, 0, { type: "start", remainingSec: 55 });
      const before = await db.userStep.findFirstOrThrow({
        where: { userTraining: { userId: A }, stepOnDayId: sl1 },
      });
      expect(before.status).toBe("IN_PROGRESS");
      const input = req(randomUUID(), 0, randomUUID());
      await expect(submitNewOfflinePracticeMutation(input)).rejects.toThrow("COURSE_DAY_MISMATCH");
      const after = await db.userStep.findUniqueOrThrow({ where: { id: before.id } });
      expect(after.status).toBe("IN_PROGRESS");
      expect(after.remainingSec).toBe(55);
      expect(await db.userStep.count({ where: { userTraining: { userId: A } } })).toBe(1);
      const rows = await db.$queryRaw<
        { n: bigint }[]
      >`SELECT COUNT(*) AS n FROM "OfflineMutationReceipt" WHERE "ownerId"=${A}`;
      expect(Number(rows[0]?.n)).toBe(0);
    });
    it("JPC06/JTX07 response lost AFTER DB commit: GET and same-event replay return original persisted result", async () => {
      const input = req();
      void (await submitNewOfflinePracticeMutation(input));
      const lookup = await findNewOfflineMutationReceipt(A, input.eventId);
      expect(lookup?.ack).toMatchObject({
        eventId: input.eventId,
        replayed: true,
        serverRevision: "1",
      });
      const replay = await submitNewOfflinePracticeMutation(input);
      expect(replay.ack.serverRevision).toBe("1");
    });
    it("JPC07/JTX08 legitimate reset then complete with fresh UUID, old event replay must NOT mutate current step", async () => {
      const original = req(),
        first = await submitNewOfflinePracticeMutation(original);
      expect(first.ack.result.stepJustCompleted).toBe(true);
      await updateStepAndDay(A, link, 0, { type: "reset" });
      const anew = req(),
        second = await submitNewOfflinePracticeMutation(anew);
      expect(second.ack.result.stepJustCompleted).toBe(true);
      const rewardRows = await db.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM "GafusRewardEvent" WHERE "userId" = ${A}`;
      expect(Number(rewardRows[0]?.n)).toBe(0);
      expect(second.ack.serverRevision).toBe("2");
      const old = await submitNewOfflinePracticeMutation(original);
      expect(old.ack.replayed).toBe(true);
      expect(await db.userStep.count({ where: { userTraining: { userId: A } } })).toBe(1);
    });
    it("JPC08/JTX09 owner scoped receipt lookup: no cross-owner ACK leak", async () => {
      const input = req();
      await submitNewOfflinePracticeMutation(input);
      expect(await findNewOfflineMutationReceipt(B, input.eventId)).toBeNull();
      expect((await findNewOfflineMutationReceipt(A, input.eventId))?.ack.eventId).toBe(
        input.eventId,
      );
    });
    // Deliberately not run until AG1 implements the corresponding separately
    // AG4-approved new-only v2 operations. These skips are NOT SQL passes.
    it.skip("JTX10 SKIP: prevention v2 clientId binding/per-item ACK route and Core not implemented", () => {});
    it.skip("JTX11 SKIP: prevention v2 atomic batch rollback not implemented", () => {});
    it.skip("JTX12 SKIP: video.position v2 expectedRevision write/CAS not implemented", () => {});
    it.skip("JTX13 SKIP: training.start v2 durable notification effect/outbox not implemented", () => {});
  },
);
