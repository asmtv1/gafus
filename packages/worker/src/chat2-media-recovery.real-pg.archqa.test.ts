import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import { createChat2MediaRecoveryTick } from "./chat2-media-recovery.js";

// Opt-in: test runner creates its own disposable PostgreSQL and sets this flag.
// Do not allow even accidental writes to any shared developer or production DB.
const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const isolated = process.env.GAFUS_MEDIA_RECOVERY_ISOLATED_ACCEPTANCE === "1" &&
  url?.hostname === "127.0.0.1" && url.pathname === "/archqa_chat2_media";
const suite = isolated ? describe : describe.skip;
const now = new Date("2026-11-07T08:00:00.000Z");
const old = new Date(now.getTime() - 60_000);
const future = new Date(now.getTime() + 60_000);
const renditions720 = { renditions: [{ quality: 720, path: "qa/720.mp4", bytes: 900 }] };
const renditionsBoth = { renditions: [
  { quality: 720, path: "qa/720.mp4", bytes: 900 },
  { quality: 360, path: "qa/360.mp4", bytes: 200 },
] };

async function seed(input: {
  status: string;
  sourceMime?: string;
  manifest?: object;
  attempts?: number;
  nextAttemptAt?: Date;
  leaseUntil?: Date;
  attemptToken?: string;
}) {
  const id = randomUUID();
  return prisma.chat2V2MediaTask.create({ data: {
    mediaId: id,
    conversationId: "archqa-test-only",
    ownerId: "archqa-test-only",
    name: "archqa-" + id,
    sourceKey: "archqa/" + id,
    sourceMime: input.sourceMime ?? "video/mp4",
    sourceBytes: 900,
    status: input.status,
    attempts: input.attempts ?? 0,
    nextAttemptAt: input.nextAttemptAt ?? old,
    leaseUntil: input.leaseUntil,
    attemptToken: input.attemptToken,
    manifest: input.manifest ?? renditions720,
  }});
}
function tick() {
  const video = vi.fn(async () => ({ dispatched: 1 }));
  const run = createChat2MediaRecoveryTick({
    database: prisma,
    video: video as never,
    now: () => now,
  });
  return { video, run };
}
suite("PostgreSQL real Chat2 360p recovery query (isolated only)", () => {
  afterEach(async () => {
    await prisma.chat2V2MediaTask.deleteMany({ where: { name: { startsWith: "archqa-" } } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("finds stale READY 720p-only, never re-runs a finished 360p", async () => {
    await seed({ status: "READY", manifest: renditions720 });
    await seed({ status: "READY", manifest: renditionsBoth });
    const { run, video } = tick();
    expect(await run()).toEqual({ dispatched: 1 });
    expect(video).toHaveBeenCalledOnce();
  });
  it("launches only two due video jobs for queued and expired PROCESSING, ignores active lease and photos", async () => {
    await seed({ status: "QUEUED" });
    await seed({ status: "PROCESSING", leaseUntil: old });
    await seed({ status: "PROCESSING", leaseUntil: future });
    await seed({ status: "QUEUED", sourceMime: "image/jpeg" });
    const { run, video } = tick();
    expect(await run()).toEqual({ dispatched: 2 });
    expect(video).toHaveBeenCalledTimes(2);
  });
  it("respects future retry, four-attempt ceiling, 720 prerequisite and active READY lease", async () => {
    await seed({ status: "READY", nextAttemptAt: future });
    await seed({ status: "READY", attempts: 4 });
    await seed({ status: "READY", manifest: { renditions: [] } });
    await seed({ status: "READY", leaseUntil: future, attemptToken: randomUUID() });
    const { run, video } = tick();
    expect(await run()).toEqual({ dispatched: 0 });
    expect(video).not.toHaveBeenCalled();
  });
});
