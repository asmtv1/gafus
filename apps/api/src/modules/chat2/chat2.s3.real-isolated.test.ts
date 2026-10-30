/** Explicit opt-in real MinIO S3 + real isolated PostgreSQL acceptance.
 * Writes only new UUID keys in the dedicated Refactor documents test bucket.
 * Never imports production S3 configuration or modifies legacy objects.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  chat2ReservePrivateObjectKey,
  chat2UploadPrivateImageOrPdf,
  chat2SignedPrivateMedia,
  chat2DeletePrivateMedia,
} from "@gafus/cdn-upload";
import { isolatedNonprodS3Config } from "../../../../../packages/cdn-upload/src/isolatedNonprodS3";
import { processChat2MediaDeletionIntentsOnce } from "../../../../../packages/worker/src/chat2-outbox-worker";

const root = "/Users/asmtv1/Desktop/gafus-refactor";
const enabled = process.env.GAFUS_CHAT2_REAL_S3_ACCEPTANCE === "enabled";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLkYAAAAASUVORK5CYII=",
  "base64",
);
let userId = "";
let roomId = "";
const keys: string[] = [];

async function uploadReserved() {
  const key = chat2ReservePrivateObjectKey(roomId, userId, png, "image/png");
  keys.push(key);
  await prisma.chat2MediaDeletionIntent.create({
    data: {
      objectKey: key,
      status: "RESERVED",
      availableAt: new Date(Date.now() + 180_000),
    },
  });
  const stored = await chat2UploadPrivateImageOrPdf(roomId, userId, png, "image/png", key);
  expect(stored.objectKey).toBe(key);
  return key;
}

async function s3Get(key: string) {
  return fetch(await chat2SignedPrivateMedia(key), {
    redirect: "error",
    signal: AbortSignal.timeout(6000),
  });
}

describe.skipIf(!enabled)("real Refactor-only S3 media durability", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "https://invalid.test");
    if (
      url.protocol !== "postgresql:" ||
      url.hostname !== "127.0.0.1" ||
      url.port !== "55432" ||
      url.pathname !== "/chat2_integration" ||
      process.env.NODE_ENV !== "development" ||
      process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
      process.env.GAFUS_ISOLATED_NONPROD_S3 !== "enabled" ||
      process.env.CHAT2_PRIVATE_MEDIA_ENABLED !== "isolated-dev-only"
    ) throw new Error("UNSAFE_CHAT2_REAL_S3_ENVIRONMENT");
    const dirs = await prisma.$queryRawUnsafe<{ data_directory: string }[]>(
      "SELECT current_setting('data_directory') AS data_directory",
    );
    if (dirs[0]?.data_directory !== `${root}/.local-pg-scratch/chat2-db`)
      throw new Error("UNSAFE_CHAT2_REAL_S3_DATABASE");
    const config = isolatedNonprodS3Config("documents");
    if (
      config?.endpoint !== "http://127.0.0.1:9000" ||
      config.bucket !== "gafus-refactor-documents-test"
    ) throw new Error("UNSAFE_CHAT2_REAL_S3_BUCKET");
    const health = await fetch("http://127.0.0.1:9000/minio/health/live", {
      signal: AbortSignal.timeout(2000),
    });
    if (!health.ok) throw new Error("ISOLATED_S3_NOT_AVAILABLE");
    const user = await prisma.user.create({
      data: { username: `chat2s3_${crypto.randomUUID().slice(0, 15)}`, password: "test-only" },
      select: { id: true },
    });
    userId = user.id;
    const room = await prisma.chat2Conversation.create({
      data: { kind: "GROUP", visibility: "PRIVATE", createdById: userId, name: "local s3" },
      select: { id: true },
    });
    roomId = room.id;
  });

  afterAll(async () => {
    // A best-effort final sweep only for UUID keys created by this test.
    for (const key of keys) {
      try { await chat2DeletePrivateMedia(key); } catch { /* cleanup ledger stays durable */ }
    }
    if (roomId) await prisma.chat2Conversation.deleteMany({ where: { id: roomId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (keys.length) {
      await prisma.chat2MediaDeletionIntent.deleteMany({
        where: { objectKey: { in: keys }, status: "DONE" },
      });
    }
    await prisma.$disconnect();
  });

  it("recovers an orphan after successful S3 PUT but interrupted DB commit", async () => {
    const key = await uploadReserved();
    const fetched = await s3Get(key);
    expect(fetched.status).toBe(200);
    expect(Buffer.from(await fetched.arrayBuffer())).toEqual(png);
    // Simulates process loss after the S3 acknowledgement: no Chat2Media row.
    await prisma.chat2MediaDeletionIntent.update({
      where: { objectKey: key },
      data: { availableAt: new Date(Date.now() - 2000) },
    });
    const result = await processChat2MediaDeletionIntentsOnce(1, key);
    expect(result.deleted).toBe(1);
    expect((await s3Get(key)).status).toBe(404);
    expect((await prisma.chat2MediaDeletionIntent.findUniqueOrThrow({
      where: { objectKey: key },
    })).status).toBe("DONE");
    expect((await processChat2MediaDeletionIntentsOnce(1, key)).deleted).toBe(0);
  });

  it("preserves a live upload despite a stale reservation, then deletes on FK cascade", async () => {
    const key = await uploadReserved();
    await prisma.chat2Media.create({
      data: {
        conversationId: roomId,
        ownerId: userId,
        objectKey: key,
        name: "isolated.png",
        kind: "image",
        mime: "image/png",
        bytes: png.byteLength,
        status: "READY",
      },
    });
    await prisma.chat2MediaDeletionIntent.update({
      where: { objectKey: key },
      data: { availableAt: new Date(Date.now() - 2000) },
    });
    expect((await processChat2MediaDeletionIntentsOnce(1, key)).deleted).toBe(0);
    expect((await s3Get(key)).status).toBe(200);
    // Delete the room, not the media row; PostgreSQL trigger must catch FK cascade.
    await prisma.chat2Conversation.delete({ where: { id: roomId } });
    roomId = "";
    expect((await prisma.chat2MediaDeletionIntent.findUniqueOrThrow({
      where: { objectKey: key },
    })).status).toBe("PENDING");
    expect((await processChat2MediaDeletionIntentsOnce(1, key)).deleted).toBe(1);
    expect((await s3Get(key)).status).toBe(404);
  });
});
