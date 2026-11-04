/** Explicit opt-in PostgreSQL 18 Chat2 queue lease/ACK/retry/reconciliation.
 * A new empty random 127.0.0.1 database is mandatory. No S3; HEAD/delete are
 * synthetic object-port callbacks. NOT a claim of CDN or worker end-to-end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { chat2V2SourceKey, chat2V2FinalKeys } from "@gafus/feed-cloud";
import { createChat2V2Queue } from "../src/modules/chat2/media-v2-jobs";

const url = process.env.DATABASE_URL ?? "";
const dbName = process.env.GAFUS_ARCHQA_CHAT2_QUEUE_DB ?? "";
const own = (() => {
  try {
    const u = new URL(url);
    return process.env.GAFUS_ARCHQA_CHAT2_QUEUE_REALPG === "1" &&
      u.protocol === "postgresql:" && u.hostname === "127.0.0.1" &&
      /^archqa_queue_[a-f0-9]{12}$/.test(dbName) &&
      u.pathname === `/${dbName}` && u.searchParams.get("schema") === "public";
  } catch { return false; }
})();
if (!own) throw Error("CHAT2_QUEUE_REALPG_FRESH_LOCAL_ONLY");
const req = createRequire(new URL("../../../packages/prisma/package.json", import.meta.url));
const { PrismaClient } = req("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url } } });
const db2 = new PrismaClient({ datasources: { db: { url } } });
const room = "archqa_room_1", owner = "archqa_owner_1";
function fixture(status = "QUEUED") {
  const mediaId = randomUUID();
  return { mediaId, conversationId: room, ownerId: owner,
    name: "synthetic.jpg", sourceMime: "image/jpeg", sourceBytes: 500,
    sourceKey: chat2V2SourceKey(room, owner, mediaId, "image/jpeg"),
    status, nextAttemptAt: new Date(Date.now() - 1000) };
}
function manifest(mediaId: string) {
  return { kind: "image" as const, width: 720, height: 480,
    imageSizes: { small: { width: 360, height: 240 }, medium: { width: 720, height: 480 } },
    keys: chat2V2FinalKeys(room, owner, mediaId).image };
}
function queue(client = db, options: { outage?: () => boolean; failDelete?: () => boolean;
  deleted?: string[][] } = {}) {
  return createChat2V2Queue({ database: client,
    head: async url => ({ status: options.outage?.() ? 503 : 200,
      mime: "image/webp", bytes: 120 }),
    deleteObjects: async keys => {
      if (options.failDelete?.()) throw Error("SYNTHETIC_S3_DELETE_OUTAGE");
      options.deleted?.push([...keys]);
    },
  });
}
beforeAll(async () => {
  const actual = await db.$queryRawUnsafe("SELECT current_database() AS db") as { db: string }[];
  expect(actual[0]?.db).toBe(dbName);
  const count = await db.chat2V2MediaTask.count();
  expect(count).toBe(0);
});
afterAll(async () => { await Promise.all([db.$disconnect(), db2.$disconnect()]); });

describe("real PostgreSQL 18 Chat2 V2 queue: crash/lease/replay/failover", () => {
  it("parallel PG clients claim only once; stale crash token is fenced after lease takeover", async () => {
    const record = fixture();
    await db.chat2V2MediaTask.create({ data: record });
    const deleted: string[][] = [];
    const a = queue(db, { deleted });
    const b = queue(db2, { deleted });
    const claims = await Promise.all([a.claimOne("image"), b.claimOne("image")]);
    const first = claims.flatMap(x => x.jobs);
    expect(first).toHaveLength(1);
    const firstToken = first[0]!.attemptToken;
    expect((await a.claimOne("image")).jobs).toHaveLength(0);
    const original = await db.chat2V2MediaTask.findUniqueOrThrow({ where: { mediaId: record.mediaId } });
    expect(original.status).toBe("PROCESSING");
    expect(original.attempts).toBe(1);
    // Simulate an actual expired lease in disposable PG, not a fake timer.
    await db.chat2V2MediaTask.update({ where: { mediaId: record.mediaId },
      data: { leaseUntil: new Date(Date.now() - 30_000) } });
    const successor = (await b.claimOne("image")).jobs[0];
    expect(successor).toBeDefined();
    expect(successor!.attemptToken).not.toBe(firstToken);
    expect((await a.renew(record.mediaId, firstToken)).accepted).toBe(false);
    expect((await a.complete(record.mediaId, firstToken, manifest(record.mediaId))).accepted)
      .toBe(false);
    expect((await a.fail(record.mediaId, firstToken, "OLD_WORKER_FAILED")).accepted)
      .toBe(false);
    expect((await b.complete(record.mediaId, successor!.attemptToken,
      manifest(record.mediaId))).accepted).toBe(true);
    const ready = await db.chat2V2MediaTask.findUniqueOrThrow({ where: { mediaId: record.mediaId } });
    expect(ready.status).toBe("READY");
    expect(ready.attempts).toBe(2);
    expect(ready.errorCode).toBeNull();
    expect(ready.cleanupCompletedAt).not.toBeNull();
    expect(deleted.flat()).toEqual([record.sourceKey]);
    expect((await b.claimOne("image")).jobs).toHaveLength(0);
    console.log("PASS REAL_PG_QUEUE_CRASH_FENCING_AND_READY");
  }, 40_000);

  it("HEAD outage cannot complete READY; fail is retried only after PG backoff", async () => {
    const record = fixture();
    await db.chat2V2MediaTask.create({ data: record });
    let unavailable = true;
    const q = queue(db, { outage: () => unavailable });
    const first = (await q.claimOne("image")).jobs[0]!;
    await expect(q.complete(record.mediaId, first.attemptToken, manifest(record.mediaId)))
      .rejects.toThrow("CHAT2_V2_S3_OUTPUT_UNVERIFIED");
    expect((await db.chat2V2MediaTask.findUniqueOrThrow({ where: { mediaId: record.mediaId } })).status)
      .toBe("PROCESSING");
    expect((await q.fail(record.mediaId, first.attemptToken, "S3_TEMP_503")).accepted).toBe(true);
    expect((await q.claimOne("image")).jobs).toHaveLength(0);
    const queued = await db.chat2V2MediaTask.findUniqueOrThrow({ where: { mediaId: record.mediaId } });
    expect(queued.status).toBe("QUEUED");
    expect(queued.attempts).toBe(1);
    expect(queued.errorCode).toBe("S3_TEMP_503");
    // Time-jump only the test-owned row: assert queue's real PG retry policy.
    await db.chat2V2MediaTask.update({ where: { mediaId: record.mediaId },
      data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    unavailable = false;
    const retry = (await q.claimOne("image")).jobs[0]!;
    expect(retry.attemptToken).not.toBe(first.attemptToken);
    expect((await q.complete(record.mediaId, retry.attemptToken,
      manifest(record.mediaId))).accepted).toBe(true);
    const ready = await db.chat2V2MediaTask.findUniqueOrThrow({ where: { mediaId: record.mediaId } });
    expect(ready.status).toBe("READY");
    expect(ready.attempts).toBe(2);
    console.log("PASS REAL_PG_S3_HEAD_FAIL_RETRY_FENCE_READY");
  }, 40_000);

  it("terminal fourth failure schedules bounded ALL cleanup, retries a failing delete", async () => {
    const record = fixture();
    await db.chat2V2MediaTask.create({ data: { ...record, attempts: 3 } });
    let failDelete = true;
    const deleted: string[][] = [];
    const q = queue(db, { failDelete: () => failDelete, deleted });
    const claim = (await q.claimOne("image")).jobs[0]!;
    expect((await q.fail(record.mediaId, claim.attemptToken, "INVALID_BYTES")).accepted)
      .toBe(true);
    const first = await db.chat2V2MediaTask.findUniqueOrThrow({ where: { mediaId: record.mediaId } });
    expect(first.status).toBe("FAILED");
    expect(first.cleanupCompletedAt).toBeNull();
    expect(first.cleanupKind).toBe("ALL");
    expect(first.cleanupAttempts).toBe(1);
    expect((await q.claimOne("image")).jobs).toHaveLength(0);
    failDelete = false;
    await db.chat2V2MediaTask.update({ where: { mediaId: record.mediaId },
      data: { cleanupNextAt: new Date(Date.now() - 1000) } });
    expect((await q.cleanupPending()).cleaned).toBe(true);
    const final = await db.chat2V2MediaTask.findUniqueOrThrow({ where: { mediaId: record.mediaId } });
    expect(final.status).toBe("FAILED");
    expect(final.cleanupAttempts).toBe(2);
    expect(final.cleanupCompletedAt).not.toBeNull();
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toContain(record.sourceKey);
    expect(deleted[0]).toHaveLength(6);
    console.log("PASS REAL_PG_TERMINAL_CLEANUP_RETRY");
  }, 40_000);

  it("stale upload reservation is expired and cleaned without touching active tasks", async () => {
    const record = fixture("AWAITING_UPLOAD");
    await db.chat2V2MediaTask.create({ data: { ...record,
      createdAt: new Date(Date.now() - 2 * 3600_000) } });
    const deleted: string[][] = [];
    const q = queue(db, { deleted });
    expect((await q.cleanupPending()).cleaned).toBe(true);
    const row = await db.chat2V2MediaTask.findUniqueOrThrow({ where: { mediaId: record.mediaId } });
    expect(row.status).toBe("EXPIRED");
    expect(row.cleanupKind).toBeNull();
    expect(row.cleanupCompletedAt).not.toBeNull();
    expect(deleted.flat()).toContain(record.sourceKey);
    console.log("PASS REAL_PG_ORPHAN_EXPIRE_AND_CLEANUP");
  }, 40_000);
});
