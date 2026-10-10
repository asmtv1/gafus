import type { PrismaClient, Prisma } from "@gafus/prisma";
type CleanupSnapshot = Prisma.AccountStorageCleanupGetPayload<Record<string, never>>;
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  db: null as PrismaClient | null,
  sweep: vi.fn(),
  purge: vi.fn(),
  done: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target, property) => {
        const value = Reflect.get(fixture.db!, property);
        return typeof value === "function" ? value.bind(fixture.db) : value;
      },
    },
  ),
}));
vi.mock("@gafus/cdn-upload", () => ({
  accountStorageTargets: () => ({ prefixes: ["uploads/users/test/"], keys: [] }),
  createAccountStorageCleaner: () => ({ sweep: fixture.sweep }),
  startAccountCdnPurge: fixture.purge,
  accountCdnPurgeDone: fixture.done,
}));
import { enqueueAccountStorageCleanup } from "./enqueue";
import { processAccountStorageCleanup } from "./worker";

const url = process.env.ACCOUNT_CLEANUP_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "55439" ||
    parsed.username !== "cleanup_test"
  )
    throw new Error("Isolated account cleanup PostgreSQL required");
}
const require = createRequire(new URL("../../../../prisma/package.json", import.meta.url));
const Client = (
  require("@prisma/client") as {
    PrismaClient: new (options: Prisma.PrismaClientOptions) => PrismaClient;
  }
).PrismaClient;
const db = url ? new Client({ datasources: { db: { url } } }) : null!;
fixture.db = db;
afterAll(async () => {
  await db?.$disconnect();
});
(url ? describe : describe.skip)("account cascade / isolated PostgreSQL", () => {
  it("snapshots all media before cascading and preserves unrelated users and their replies", async () => {
    const owner = randomUUID(),
      other = randomUUID();
    const at = new Date();
    await db.user.createMany({
      data: [owner, other].map((id) => ({ id, username: id, password: "test" })),
    });
    await db.userProfile.create({
      data: {
        userId: owner,
        avatarUrl: `https://storage.yandexcloud.net/gafus-media/uploads/users/${owner}/avatar/a.jpg`,
      },
    });
    const pet = await db.pet.create({
      data: {
        ownerId: owner,
        name: "Test",
        type: "DOG",
        breed: "Test",
        birthDate: at,
        photoUrl: `users/${owner}/pets/p/a.jpg`,
      },
    });
    await db.petDocument.create({
      data: {
        petId: pet.id,
        ownerId: owner,
        name: "Document",
        mimeType: "application/pdf",
        sizeBytes: 10,
        url: `users/${owner}/pets/p/doc.pdf`,
      },
    });
    const visit = await db.petVetVisit.create({
      data: { ownerId: owner, petId: pet.id, visitedOn: at, specialty: "Test" },
    });
    const originalKey = `users/${owner}/pets/${pet.id}/vet-visits/${visit.id}/file/original.pdf`;
    await db.petVetAttachment.create({
      data: {
        visitId: visit.id,
        name: "File",
        mimeType: "application/pdf",
        sizeBytes: 10,
        originalKey,
      },
    });
    const album = await db.galleryAlbum.create({ data: { ownerId: owner, name: "Album" } });
    const thumbKey = `albums/${owner}/${album.id}/photos/photo/thumb.webp`;
    await db.galleryPhoto.create({
      data: { ownerId: owner, albumId: album.id, reservationExpiresAt: at, thumbKey },
    });
    const question = await db.question.create({
      data: {
        authorId: owner,
        clientRequestId: randomUUID(),
        title: "Title",
        body: "Body",
        category: "general",
      },
    });
    const answer = await db.questionAnswer.create({
      data: {
        questionId: question.id,
        authorId: other,
        clientRequestId: randomUUID(),
        body: "Other answer",
      },
    });
    const borrowedPhoto = `questions/${other}/borrowed.jpg`;
    await db.questionPhoto.create({
      data: {
        ownerId: other,
        answerId: answer.id,
        url: "https://example.test/photo",
        storagePath: borrowedPhoto,
      },
    });
    const post = await db.feedPost.create({
      data: { authorId: owner, clientRequestId: randomUUID() },
    });
    const ownPostMedia = `posts/${owner}/${post.id}/attachments/media/thumb.webp`;
    await db.feedMediaAsset.create({
      data: { postId: post.id, ownerId: owner, kind: "photo", thumbKey: ownPostMedia },
    });
    const otherPost = await db.feedPost.create({
      data: { authorId: other, clientRequestId: randomUUID() },
    });
    const root = await db.feedComment.create({
      data: {
        authorId: owner,
        postId: otherPost.id,
        text: "Comment",
        clientRequestId: randomUUID(),
      },
    });
    const reply = await db.feedComment.create({
      data: {
        authorId: other,
        postId: otherPost.id,
        text: "Preserved reply",
        clientRequestId: randomUUID(),
        rootId: root.id,
        replyToId: root.id,
      },
    });
    await db.communityChatAttachment.create({
      data: {
        ownerUserId: owner,
        kind: "image",
        url: "https://test.stream-io-cdn.com/a.jpg",
        mime: "image/jpeg",
        name: "Image",
        size: 10,
      },
    });
    const leaseUntil = new Date(Date.now() + 60 * 60_000);
    await db.galleryStorageJob.create({
      data: {
        ownerId: owner,
        kind: "publish",
        dedupeKey: randomUUID(),
        sourceKeys: [`albums/${owner}/staged.webp`],
        targetKeys: [`albums/${owner}/inflight.webp`],
        leaseUntil,
      },
    });
    try {
      await db.$transaction(async (tx: Prisma.TransactionClient) => {
        await enqueueAccountStorageCleanup(tx, owner, at);
        await tx.user.delete({ where: { id: owner } });
      });
      const jobs = await db.$queryRaw<
        CleanupSnapshot[]
      >`SELECT * FROM "AccountStorageCleanup" WHERE "ownerId" = ${owner}`;
      expect(jobs.map((x) => x.scope).sort()).toEqual(["feed", "gallery", "public", "stream"]);
      expect(jobs.find((x) => x.scope === "gallery").availableAt.getTime()).toBeGreaterThan(
        leaseUntil.getTime(),
      );
      expect(jobs.find((x) => x.scope === "public").keys).toEqual(
        expect.arrayContaining([
          borrowedPhoto,
          `users/${owner}/pets/p/a.jpg`,
          `users/${owner}/pets/p/doc.pdf`,
        ]),
      );
      const galleryJobs = await db.galleryStorageJob.findMany({
        where: { ownerId: owner, kind: "delete" },
      });
      expect(galleryJobs.flatMap((x) => x.sourceKeys)).toEqual(
        expect.arrayContaining([originalKey, thumbKey]),
      );
      const feedJobs = await db.feedStorageJob.findMany({
        where: { ownerId: owner, kind: "delete_keys" },
      });
      expect(feedJobs.flatMap((x) => x.sourceKeys)).toContain(ownPostMedia);
      expect(await db.user.findUnique({ where: { id: owner } })).toBeNull();
      for (const [model, where] of [
        ["pet", { ownerId: owner }],
        ["petVetVisit", { ownerId: owner }],
        ["petVetAttachment", { visitId: visit.id }],
        ["galleryAlbum", { ownerId: owner }],
        ["galleryPhoto", { ownerId: owner }],
        ["feedPost", { authorId: owner }],
        ["question", { authorId: owner }],
        ["questionPhoto", { answerId: answer.id }],
        ["communityChatAttachment", { ownerUserId: owner }],
      ] as const)
        expect(await db[model].count({ where })).toBe(0);
      expect(await db.feedComment.findUnique({ where: { id: reply.id } })).toMatchObject({
        text: "Preserved reply",
        rootId: null,
        replyToId: null,
      });
      expect(await db.user.findUnique({ where: { id: other } })).not.toBeNull();
    } finally {
      await db.user.deleteMany({ where: { id: { in: [owner, other] } } });
      await db.$executeRaw`DELETE FROM "AccountStorageCleanup" WHERE "ownerId" = ${owner}`;
      await db.galleryStorageJob.deleteMany({ where: { ownerId: owner } });
      await db.feedStorageJob.deleteMany({ where: { ownerId: owner } });
    }
  });
  it("rolls back snapshots and user deletion together", async () => {
    const owner = randomUUID();
    await db.user.create({ data: { id: owner, username: owner, password: "test" } });
    try {
      await expect(
        db.$transaction(async (tx: Prisma.TransactionClient) => {
          await enqueueAccountStorageCleanup(tx, owner, new Date());
          await tx.user.delete({ where: { id: owner } });
          throw new Error("rollback");
        }),
      ).rejects.toThrow("rollback");
      expect(await db.user.findUnique({ where: { id: owner } })).not.toBeNull();
      expect(
        await db.$queryRaw`SELECT "id" FROM "AccountStorageCleanup" WHERE "ownerId" = ${owner}`,
      ).toEqual([]);
    } finally {
      await db.user.delete({ where: { id: owner } });
    }
  });
  it("executes real claims, persisted purge operations, retries and completion", async () => {
    const id = randomUUID(),
      owner = randomUUID();
    await db.$executeRaw`INSERT INTO "AccountStorageCleanup" ("id", "ownerId", "scope", "availableAt") VALUES (${id}, ${owner}, 'public', timezone('UTC', now()))`;
    fixture.sweep.mockResolvedValue(0);
    fixture.purge.mockResolvedValue(["operation-test"]);
    fixture.done.mockResolvedValue(true);
    try {
      await processAccountStorageCleanup(1);
      let [job] = await db.$queryRaw<
        CleanupSnapshot[]
      >`SELECT * FROM "AccountStorageCleanup" WHERE "id" = ${id}`;
      expect(job).toMatchObject({
        status: "pending",
        attempts: 1,
        purgeOperations: ["operation-test"],
        attemptToken: null,
      });
      await db.$executeRaw`UPDATE "AccountStorageCleanup" SET "availableAt" = timezone('UTC', now()), "purgeAfter" = timezone('UTC', now()) - interval '1 minute' WHERE "id" = ${id}`;
      fixture.sweep.mockRejectedValueOnce(new Error("storage failure"));
      await processAccountStorageCleanup(1);
      [job] = await db.$queryRaw<
        CleanupSnapshot[]
      >`SELECT * FROM "AccountStorageCleanup" WHERE "id" = ${id}`;
      expect(job).toMatchObject({
        status: "pending",
        attempts: 2,
        errorCode: "CLEANUP_RETRY",
        purgeAfter: null,
        purgeOperations: [],
      });
      await db.$executeRaw`UPDATE "AccountStorageCleanup" SET "availableAt" = timezone('UTC', now()) WHERE "id" = ${id}`;
      await processAccountStorageCleanup(1);
      await db.$executeRaw`UPDATE "AccountStorageCleanup" SET "availableAt" = timezone('UTC', now()), "purgeAfter" = timezone('UTC', now()) - interval '1 minute' WHERE "id" = ${id}`;
      await processAccountStorageCleanup(1);
      [job] = await db.$queryRaw<
        CleanupSnapshot[]
      >`SELECT * FROM "AccountStorageCleanup" WHERE "id" = ${id}`;
      expect(job).toMatchObject({
        status: "done",
        attempts: 4,
        errorCode: null,
        keys: [],
        leaseUntil: null,
      });
    } finally {
      await db.$executeRaw`DELETE FROM "AccountStorageCleanup" WHERE "id" = ${id}`;
    }
  });
});
