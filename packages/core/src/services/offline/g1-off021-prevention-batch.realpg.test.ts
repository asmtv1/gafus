/**
 * AG4-approved OFF021 prevention.batch JTX10/JTX11 + concurrence:
 * real AG4 PG14 127.0.0.1:55455, actual Prisma tx/Core reminder computation.
 * No fake journal/progress database, no legacy/native queue, no migration.
 * Existing legacy PetPreventionEntry semantics must be preserved.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, lstatSync, realpathSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  submitNewOfflinePreventionBatch,
  findNewOfflineMutationReceipt,
} from "./offlineMutationJournal";
// Existing Core's ESM course/offline import cycle is avoided only in the test
// loader: the SQL implementation and reminder computation are ORIGINAL source.
vi.mock("../petPrevention/petPreventionService", async () => {
  // @ts-expect-error Vite-only query suffix creates fresh real-module evaluation
  return import("../petPrevention/petPreventionService.ts?g1_off021_prevention_real_core");
});
const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const LEASE =
  ROOT +
  "/apps/admin-panel/.ag4-off021-journal-pg-20261017/AG4_AG1_OFF021_JOURNAL_ACTIVE_PG_LEASE.v1.json";
const URL =
  "postgresql://off021_journal_owner@127.0.0.1:55455/gafus_off021_journal_ag1_20261017?schema=public";
const RUN =
  process.env.AG1_OFF021_JOURNAL_PG_URL === URL &&
  process.env.AG1_OFF021_JOURNAL_LEASE_FILE === LEASE &&
  process.env.DATABASE_URL === URL &&
  process.env.AG1_OFF021_PREVENTION_PG === "1";
if (process.env.AG1_OFF021_PREVENTION_PG && !RUN)
  throw Error("OFF021_PREVENTION_REQUIRES_EXACT_AG4_PG55_LEASE");
const CAPTURE = ROOT + "/apps/api/.g1-off021-prevention-v2-ag1-20261017/captures";
const CAPTURE_ENABLED =
  process.env.AG1_OFF021_PREVENTION_CAPTURE_DIR === CAPTURE &&
  process.env.TMPDIR?.startsWith(ROOT + "/apps/api/.g1-off021-prevention-v2-ag1-20261017/tmp/");
const item = (
  clientId = randomUUID(),
  eventId = randomUUID(),
  productName = "JTX synthetic vaccine",
) => ({
  eventId,
  clientId,
  type: "VACCINATION" as const,
  performedAt: "2026-10-16T12:00:00.000Z",
  productName,
  reminderEnabled: true,
  reminderKind: "AFTER_DAYS" as const,
  reminderDaysAfter: 30,
  reminderTimes: ["09:00"],
});
type Item = ReturnType<typeof item>;
(RUN ? describe : describe.skip)(
  "AG1 OFF021 prevention v2 first method actual PG JTX10/JTX11",
  () => {
    let A = "",
      B = "",
      pet = "";
    const request = (eventId = randomUUID(), entries: Item[] = [item()], ownerId = A) => ({
      ownerId,
      eventId,
      operation: "prevention.batch" as const,
      petId: pet,
      entries,
    });
    async function entryCount() {
      return prisma.petPreventionEntry.count({ where: { petId: pet } });
    }
    async function receiptCount() {
      const x = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        'SELECT COUNT(*) AS n FROM "OfflineMutationReceipt" WHERE "ownerId"=$1',
        A,
      );
      return Number(x[0]?.n ?? 0n);
    }
    async function boundCount() {
      const x = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        'SELECT COUNT(*) AS n FROM "OfflinePreventionClientBinding" WHERE "ownerId"=$1',
        A,
      );
      return Number(x[0]?.n ?? 0n);
    }
    async function revision() {
      const x = await prisma.$queryRawUnsafe<{ revision: bigint }[]>(
        'SELECT "revision" FROM "OfflineResourceRevision" WHERE "ownerId"=$1 AND "resourceKey"=$2',
        A,
        "prevention:" + pet,
      );
      return Number(x[0]?.revision ?? 0n);
    }
    beforeAll(async () => {
      if (lstatSync(LEASE).isSymbolicLink() || realpathSync(LEASE) !== LEASE)
        throw Error("LEASE_SYMLINK");
      const x = JSON.parse(readFileSync(LEASE, "utf8"));
      if (
        x.state !== "ACTIVE_AG1_OFF021_JOURNAL_SQL_ONLY" ||
        x.executor !== "AG1" ||
        x.port !== 55455 ||
        x.database !== "gafus_off021_journal_ag1_20261017" ||
        !x.AG1SQLReady ||
        Date.parse(x.expiresAtUTC) <= Date.now()
      )
        throw Error("AG4_LEASE_NOT_ACTIVE");
      const allowed = JSON.parse(
        readFileSync(
          ROOT +
            "/apps/admin-panel/.ag4-off021-journal-pg-20261017/AG4_OFF021_PRACTICE_JTX9_MOBILE_V2_PHASE1_ACCEPTANCE_20261017.v1.json",
          "utf8",
        ),
      );
      if (
        allowed.NextMethod?.operation !== "prevention.batch" ||
        allowed.NextMethod?.status !==
          "AG1_IMPLEMENTATION_AND_TESTS_ALLOWED_NOW_WITH_CURRENT_LEASE; NOT_PASSED"
      )
        throw Error("AG4_PREVENTION_METHOD_GATE_MISSING");
      const db = await prisma.$queryRawUnsafe<{ name: string; actor: string; port: number }[]>(
        "SELECT current_database() AS name,current_user AS actor,inet_server_port() AS port",
      );
      if (
        db[0]?.name !== "gafus_off021_journal_ag1_20261017" ||
        db[0]?.actor !== "off021_journal_owner" ||
        db[0]?.port !== 55455
      )
        throw Error("WRONG_DATABASE");
    });
    beforeEach(async () => {
      A = randomUUID();
      B = randomUUID();
      pet = randomUUID();
      await prisma.user.createMany({
        data: [
          {
            id: A,
            username: "jtx10-" + A,
            email: "jtx10-" + A + "@example.test",
            password: "SYNTHETIC_ONLY",
          },
          {
            id: B,
            username: "jtx10-" + B,
            email: "jtx10-" + B + "@example.test",
            password: "SYNTHETIC_ONLY",
          },
        ],
      });
      await prisma.pet.create({
        data: {
          id: pet,
          ownerId: A,
          name: "Synthetic dog",
          type: "DOG",
          breed: "synthetic",
          birthDate: new Date("2024-01-01T00:00:00.000Z"),
        },
      });
    });
    afterEach(async (ctx) => {
      // Snapshot REAL Postgres SQL row state, before synthetic fixture cleanup.
      // Captures have synthetic UUIDs only, no JWT, emails or historic events.
      try {
        const caseId = ctx.task.name.match(/^JTX(?:10|11)[A-E]/)?.[0];
        if (CAPTURE_ENABLED && caseId) {
          const rows = await prisma.petPreventionEntry.findMany({
            where: { petId: pet },
            select: {
              id: true,
              clientId: true,
              type: true,
              performedAt: true,
              remindAt: true,
              reminderEnabled: true,
              reminderDaysAfter: true,
              lastNotifiedForRemindAt: true,
              sentTimesForRemindAt: true,
            },
          });
          const bindings = await prisma.$queryRawUnsafe<
            { clientId: string; payloadHash: string }[]
          >(
            'SELECT "clientId"::text AS "clientId","payloadHash" FROM "OfflinePreventionClientBinding" WHERE "ownerId"=$1 AND "petId"=$2',
            A,
            pet,
          );
          const receipts = await prisma.$queryRawUnsafe<
            { eventId: string; operation: string; state: string; responseBody: unknown }[]
          >(
            'SELECT "eventId"::text AS "eventId","operation","state","responseBody" FROM "OfflineMutationReceipt" WHERE "ownerId"=$1',
            A,
          );
          const rev = await revision();
          mkdirSync(CAPTURE, { recursive: true });
          writeFileSync(
            join(CAPTURE, caseId + ".json"),
            JSON.stringify(
              {
                caseId,
                provenance:
                  "REAL_PRISMA_SQL_PG14_AG4_PORT_55455_PREVENTION_BATCH_TX_NO_CORE_DB_MOCK",
                operation: "prevention.batch",
                actualSql: true,
                ownerA: A,
                ownerB: B,
                petId: pet,
                rows,
                bindings,
                receipts,
                revision: rev,
                externalRemindersInvoked: false,
              },
              null,
              2,
            ) + "\n",
            { flag: "wx" },
          );
        }
      } finally {
        // We own ONLY synthetic owner UUIDs/pet IDs. AG4 owns PGDATA and cluster.
        await prisma.petPreventionEntry.deleteMany({ where: { petId: pet } });
        await prisma.$executeRawUnsafe(
          'DELETE FROM "OfflineMutationReceipt" WHERE "ownerId" IN ($1,$2)',
          A,
          B,
        );
        await prisma.$executeRawUnsafe(
          'DELETE FROM "OfflineResourceRevision" WHERE "ownerId" IN ($1,$2)',
          A,
          B,
        );
        await prisma.pet.deleteMany({ where: { id: pet } });
        await prisma.user.deleteMany({ where: { id: { in: [A, B] } } });
      }
    });
    afterAll(async () => {
      await prisma.$disconnect();
    });
    it("JTX10A exact two-item batch returns complete immutable per-item ACK then same event persisted replay", async () => {
      const i1 = item(),
        i2 = item();
      const cmd = request(randomUUID(), [i1, i2]);
      const first = await submitNewOfflinePreventionBatch(cmd);
      expect(first.ack).toMatchObject({
        eventId: cmd.eventId,
        state: "COMMITTED",
        replayed: false,
        serverRevision: "1",
      });
      expect(first.ack.items.map((x) => x.clientId)).toEqual([i1.clientId, i2.clientId]);
      expect(
        first.ack.items.every(
          (x) => x.state === "COMMITTED" && x.result === "CREATED" && x.serverRowId,
        ),
      ).toBe(true);
      const replay = await submitNewOfflinePreventionBatch(cmd);
      expect(replay.ack).toEqual({ ...first.ack, replayed: true });
      expect(await entryCount()).toBe(2);
      expect(await boundCount()).toBe(2);
      expect(await receiptCount()).toBe(1);
      expect(await revision()).toBe(1);
      const saved = await prisma.petPreventionEntry.findUniqueOrThrow({
        where: { petId_clientId: { petId: pet, clientId: i1.clientId } },
      });
      expect(saved.reminderDaysAfter).toBe(30);
      expect(saved.remindAt).not.toBeNull();
    });
    it("JTX10B parent same UUID changed item payload gives conflict without any partial updates", async () => {
      const first = item();
      const cmd = request(randomUUID(), [first]);
      await submitNewOfflinePreventionBatch(cmd);
      await expect(
        submitNewOfflinePreventionBatch({
          ...cmd,
          entries: [{ ...first, productName: "Changed" }],
        }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
      expect(await entryCount()).toBe(1);
      expect(await boundCount()).toBe(1);
      expect(await receiptCount()).toBe(1);
      expect(await revision()).toBe(1);
    });
    it("JTX10C separate new event with SAME already-bound clientId rejects unchanged body too", async () => {
      const i = item();
      await submitNewOfflinePreventionBatch(request(randomUUID(), [i]));
      await expect(
        submitNewOfflinePreventionBatch(request(randomUUID(), [i])),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
      expect(await entryCount()).toBe(1);
      expect(await boundCount()).toBe(1);
      expect(await receiptCount()).toBe(1);
    });
    it("JTX10D concurrent same parent event on two real PostgreSQL connections commits once", async () => {
      const cmd = request(randomUUID(), [item(), item()]);
      const both = await Promise.all([
        submitNewOfflinePreventionBatch(cmd),
        submitNewOfflinePreventionBatch(cmd),
      ]);
      expect(both.map((x) => x.ack.replayed).sort()).toEqual([false, true]);
      expect(await entryCount()).toBe(2);
      expect(await boundCount()).toBe(2);
      expect(await receiptCount()).toBe(1);
      expect(await revision()).toBe(1);
    });
    it("JTX10E concurrent distinct parents with SAME clientId conflicting on immutable binding", async () => {
      const i = item();
      const results = await Promise.allSettled([
        submitNewOfflinePreventionBatch(request(randomUUID(), [i])),
        submitNewOfflinePreventionBatch(request(randomUUID(), [i])),
      ]);
      expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((x) => x.status === "rejected")).toMatchObject([
        { status: "rejected", reason: { code: "IDEMPOTENCY_KEY_CONFLICT" } },
      ]);
      expect(await entryCount()).toBe(1);
      expect(await boundCount()).toBe(1);
    });
    it("JTX11A conflict on SECOND item rolls back FIRST actual SQL entry, binding, receipt and revision", async () => {
      const old = item();
      await prisma.petPreventionEntry.create({
        data: {
          petId: pet,
          ownerId: A,
          clientId: old.clientId,
          type: "VACCINATION",
          performedAt: new Date(old.performedAt),
          productName: "Existing legacy never modified",
        },
      });
      const first = item();
      await expect(
        submitNewOfflinePreventionBatch(request(randomUUID(), [first, old])),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
      expect(await entryCount()).toBe(1);
      const preserved = await prisma.petPreventionEntry.findUniqueOrThrow({
        where: { petId_clientId: { petId: pet, clientId: old.clientId } },
      });
      expect(preserved.productName).toBe("Existing legacy never modified");
      expect(await boundCount()).toBe(0);
      expect(await receiptCount()).toBe(0);
      expect(await revision()).toBe(0);
    });
    it("JTX11B owner B cannot mutate pet belonging to A, no journal/entry/ACK", async () => {
      await expect(
        submitNewOfflinePreventionBatch(request(randomUUID(), [item()], B)),
      ).rejects.toMatchObject({ code: "PET_NOT_FOUND" });
      expect(await entryCount()).toBe(0);
      expect(await boundCount()).toBe(0);
      expect(await receiptCount()).toBe(0);
    });
    it("JTX11C legacy unbound matching clientId always 409 and zero v2 adoption", async () => {
      const old = item();
      await prisma.petPreventionEntry.create({
        data: {
          petId: pet,
          ownerId: A,
          clientId: old.clientId,
          type: "VACCINATION",
          performedAt: new Date(old.performedAt),
          productName: "Legacy",
        },
      });
      await expect(
        submitNewOfflinePreventionBatch(request(randomUUID(), [old])),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
      expect(await entryCount()).toBe(1);
      expect(await boundCount()).toBe(0);
      expect(await receiptCount()).toBe(0);
    });
    it("JTX11D lost response AFTER commit: lookup and replay match every saved per-item ACK", async () => {
      const command = request(randomUUID(), [item(), item()]);
      const original = await submitNewOfflinePreventionBatch(command);
      const ownerLookup = await findNewOfflineMutationReceipt(A, command.eventId);
      expect(ownerLookup?.ack).toEqual({ ...original.ack, replayed: true });
      expect(await findNewOfflineMutationReceipt(B, command.eventId)).toBeNull();
      const replay = await submitNewOfflinePreventionBatch(command);
      expect(replay.ack).toEqual({ ...original.ack, replayed: true });
      expect(await entryCount()).toBe(2);
      expect(await receiptCount()).toBe(1);
    });
    it("JTX11E duplicate clientId/eventId within single parent batch rejected before SQL", async () => {
      const i = item();
      await expect(
        submitNewOfflinePreventionBatch(
          request(randomUUID(), [i, { ...i, eventId: randomUUID() }]),
        ),
      ).rejects.toMatchObject({ code: "INVALID_BATCH_INPUT" });
      await expect(
        submitNewOfflinePreventionBatch(
          request(randomUUID(), [i, { ...i, clientId: randomUUID() }]),
        ),
      ).rejects.toMatchObject({ code: "INVALID_BATCH_INPUT" });
      expect(await entryCount()).toBe(0);
      expect(await receiptCount()).toBe(0);
    });
  },
);
