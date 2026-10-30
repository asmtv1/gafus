/** Opt-in end-to-end group avatars. Only disposable Refactor PG + private MinIO. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { chat2DeletePrivateMedia } from "@gafus/cdn-upload";
import { isolatedNonprodS3Config } from "../../../../../packages/cdn-upload/src/isolatedNonprodS3";
import { changeGroupAvatar, chatDetails, listChats, removeGroupAvatar } from "./service";

const enabled = process.env.GAFUS_CHAT2_AVATAR_ACCEPTANCE === "enabled";
const image = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLkYAAAAASUVORK5CYII=",
    "base64",
  ),
);
const uploadedKeys: string[] = [];
let owner = "";
let participant = "";
let roomId = "";

describe.skipIf(!enabled)("Chat2 custom group avatar in isolated PostgreSQL and S3", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "http://invalid.example");
    if (
      url.protocol !== "postgresql:" ||
      url.hostname !== "127.0.0.1" ||
      url.port !== "55432" ||
      url.pathname !== "/chat2_integration" ||
      url.username !== "chat2_dev" ||
      process.env.NODE_ENV !== "development" ||
      process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
      process.env.GAFUS_ISOLATED_NONPROD_S3 !== "enabled" ||
      process.env.CHAT2_PRIVATE_MEDIA_ENABLED !== "isolated-dev-only"
    )
      throw new Error("UNSAFE_AVATAR_ACCEPTANCE_ENV");
    const data = await prisma.$queryRaw<{ data_directory: string }[]>`
      SELECT current_setting('data_directory') AS data_directory`;
    if (
      data[0]?.data_directory !== "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/chat2-db"
    )
      throw new Error("UNSAFE_AVATAR_ACCEPTANCE_DB");
    const storage = isolatedNonprodS3Config("documents");
    if (
      storage?.endpoint !== "http://127.0.0.1:9000" ||
      storage.bucket !== "gafus-refactor-documents-test"
    )
      throw new Error("UNSAFE_AVATAR_ACCEPTANCE_STORAGE");
    const seed = crypto.randomUUID().slice(0, 12);
    owner = (
      await prisma.user.create({
        data: { username: `avowner_${seed}`, password: "test-only" },
        select: { id: true },
      })
    ).id;
    participant = (
      await prisma.user.create({
        data: { username: `avmember_${seed}`, password: "test-only" },
        select: { id: true },
      })
    ).id;
    roomId = (
      await prisma.chat2Conversation.create({
        data: {
          kind: "GROUP",
          visibility: "PUBLIC",
          name: "Avatar acceptance fixture",
          createdById: owner,
          members: {
            create: [
              { userId: owner, role: "OWNER" },
              { userId: participant, role: "MEMBER" },
            ],
          },
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    // Only our newly generated room, users, keys and deletion-intent rows.
    if (roomId) await prisma.chat2Conversation.deleteMany({ where: { id: roomId } });
    if (participant || owner) {
      await prisma.user.deleteMany({ where: { id: { in: [participant, owner].filter(Boolean) } } });
    }
    for (const key of uploadedKeys) {
      try {
        await chat2DeletePrivateMedia(key);
        await prisma.chat2MediaDeletionIntent.updateMany({
          where: { objectKey: key },
          data: { status: "DONE", completedAt: new Date() },
        });
      } catch {
        /* Leave pending cleanup intents intact for the worker. */
      }
    }
    if (uploadedKeys.length)
      await prisma.chat2MediaDeletionIntent.deleteMany({
        where: { objectKey: { in: uploadedKeys }, status: "DONE" },
      });
    await prisma.$disconnect();
  });

  it("rejects non-moderators and non-image uploads", async () => {
    await expect(
      changeGroupAvatar(participant, roomId, {
        name: "avatar.png",
        type: "image/png",
        bytes: image,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(
      changeGroupAvatar(owner, roomId, {
        name: "avatar.pdf",
        type: "application/pdf",
        bytes: image,
      }),
    ).rejects.toMatchObject({ code: "INVALID_AVATAR", status: 400 });
  });

  it("uploads, displays, replaces and removes a private group avatar", async () => {
    const result = await changeGroupAvatar(owner, roomId, {
      name: "logo.png",
      type: "image/png",
      bytes: image,
    });
    expect(result.avatarUrl).toContain("chat2/");
    const original = await prisma.chat2Conversation.findUniqueOrThrow({ where: { id: roomId } });
    expect(original.avatarMediaId).toBeTruthy();
    const first = await prisma.chat2Media.findUniqueOrThrow({
      where: { id: original.avatarMediaId! },
    });
    uploadedKeys.push(first.objectKey);
    expect(first.status).toBe("AVATAR");
    expect((await fetch(result.avatarUrl!, { signal: AbortSignal.timeout(8000) })).status).toBe(
      200,
    );
    expect((await chatDetails(participant, roomId)).avatarUrl).toBeTruthy();
    expect((await listChats(owner)).find((item) => item.id === roomId)?.avatarUrl).toBeTruthy();
    expect(
      (await listChats(participant)).find((item) => item.id === roomId)?.avatarUrl,
    ).toBeTruthy();
    const second = await changeGroupAvatar(owner, roomId, {
      name: "new.png",
      type: "image/png",
      bytes: image,
    });
    expect(second.avatarUrl).toBeTruthy();
    const updated = await prisma.chat2Conversation.findUniqueOrThrow({ where: { id: roomId } });
    expect(updated.avatarMediaId).not.toBe(original.avatarMediaId);
    const replacement = await prisma.chat2Media.findUniqueOrThrow({
      where: { id: updated.avatarMediaId! },
    });
    uploadedKeys.push(replacement.objectKey);
    expect(
      await prisma.chat2Media.findUnique({ where: { id: original.avatarMediaId! } }),
    ).toBeNull();
    expect(
      await prisma.chat2MediaDeletionIntent.findUnique({
        where: { objectKey: first.objectKey },
      }),
    ).toBeTruthy();
    await expect(removeGroupAvatar(participant, roomId)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(await removeGroupAvatar(owner, roomId)).toEqual({ avatarUrl: null });
    expect((await chatDetails(owner, roomId)).avatarUrl).toBeNull();
    expect(
      await prisma.chat2Media.findUnique({ where: { id: updated.avatarMediaId! } }),
    ).toBeNull();
    expect(
      await prisma.chat2MediaDeletionIntent.findUnique({
        where: { objectKey: replacement.objectKey },
      }),
    ).toBeTruthy();
  });
});
