/** Opt-in end-to-end local PostgreSQL -> outbox -> Centrifugo -> WebSocket.
 * Fail before mutations if database/Redis/Centrifugo are not verified loopback-only.
 */
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const isolatedMedia = vi.hoisted(() => ({ remove: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@gafus/cdn-upload", () => ({
  chat2DeletePrivateMedia: isolatedMedia.remove,
  chat2ReservePrivateObjectKey: vi.fn(),
  chat2UploadPrivateImageOrPdf: vi.fn(),
  chat2SignedPrivateMedia: vi.fn(),
}));
import { chat2ReservePrivateObjectKey, chat2UploadPrivateImageOrPdf } from "@gafus/cdn-upload";
import { SignJWT } from "jose";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
// This test deliberately overrides the global Vitest queues/ioredis mocks, but
// only if explicitly enabled with a disposable loopback-only environment.
vi.unmock("ioredis");
vi.mock("@gafus/queues", async (importOriginal) => {
  if (process.env.GAFUS_CHAT2_REALTIME_ACCEPTANCE !== "enabled")
    return {
      connection: { ping: async () => "PONG", quit: async () => "OK" },
      pushQueue: { add: async () => undefined, close: async () => undefined },
    };
  return importOriginal();
});
import { prisma } from "@gafus/prisma";
import { connection, pushQueue } from "@gafus/queues";
import { Job } from "bullmq";
import {
  createGroup,
  joinGroup,
  sendMessage,
  messages,
  openCynologist,
  openDirect,
  openCourse,
  muteChat,
  moderateGroup,
  deleteMessage,
  uploadAttachment,
} from "./service";
import { connectToken, subscriptionToken } from "./realtime";
import {
  processChat2OutboxOnce,
  processChat2MediaDeletionIntentsOnce,
  pruneChat2CompletedMediaIntentsOnce,
} from "../../../../../packages/worker/src/chat2-outbox-worker";

const root = "/Users/asmtv1/Desktop/gafus-refactor";
const requireWeb = createRequire(`${root}/apps/web-vite/package.json`);
const { Centrifuge } = requireWeb("centrifuge");
const WebSocket = requireWeb("ws");
const enabled = process.env.GAFUS_CHAT2_REALTIME_ACCEPTANCE === "enabled";
let creator = "",
  reader = "",
  outsider = "",
  room = "";
const users: string[] = [];
let pushChatId = "",
  fakeJobId = "",
  directJobId = "";
const environment = () => {
  const url = new URL(process.env.DATABASE_URL ?? "https://invalid.local");
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "55432" ||
    url.pathname !== "/chat2_integration"
  )
    throw new Error("UNSAFE_DATABASE_TEST");
  if (process.env.REDIS_URL !== "redis://127.0.0.1:6389") throw new Error("UNSAFE_REDIS_TEST");
  if (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "development")
    throw new Error("UNSAFE_NODE_ENV");
  process.env.CHAT2_PUBLIC_WS_URL = "ws://127.0.0.1:8039/connection/websocket";
  process.env.CHAT2_CENTRIFUGO_HTTP_API = "http://127.0.0.1:8039/api/publish";
  const secrets = JSON.parse(
    readFileSync(`${root}/.local-pg-scratch/chat2-realtime-secrets.json`, "utf8"),
  ) as { jwt: string; api: string };
  process.env.CHAT2_CENTRIFUGO_TOKEN_SECRET = secrets.jwt;
  process.env.CHAT2_CENTRIFUGO_API_KEY = secrets.api;
};
describe.skipIf(!enabled)("real isolated Chat2 realtime E2E", () => {
  beforeAll(async () => {
    environment();
    const dir = await prisma.$queryRawUnsafe<{ data_directory: string }[]>(
      "SELECT current_setting('data_directory') AS data_directory",
    );
    if (dir[0]?.data_directory !== `${root}/.local-pg-scratch/chat2-db`)
      throw new Error("UNSAFE_DATABASE_DIRECTORY");
    const pong = await connection.ping();
    if (pong !== "PONG") throw new Error("UNSAFE_REDIS_UNAVAILABLE");
    const health = await fetch("http://127.0.0.1:8039/health", {
      signal: AbortSignal.timeout(2000),
    });
    if (!health.ok) throw new Error("CENTRIFUGO_UNAVAILABLE");
    const seed = Date.now().toString(36);
    for (const suffix of ["writer", "reader", "outsider"]) {
      const record = await prisma.user.create({
        data: {
          username: `chat2ws_${suffix}_${seed}`,
          password: "local-test-only",
          email: `chat2ws_${suffix}_${seed}@example.invalid`,
        },
        select: { id: true },
      });
      users.push(record.id);
    }
    [creator, reader, outsider] = users;
    room = (
      await createGroup(creator, {
        name: "Local realtime acceptance",
        kind: "GROUP",
        visibility: "PUBLIC",
      })
    ).conversationId;
    await joinGroup(reader, room);
  });
  afterAll(async () => {
    for (const id of [fakeJobId, directJobId])
      if (id) {
        const job = await Job.fromId(pushQueue, id);
        if (job) await job.remove();
      }
    if (users.length) {
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      if (room) await prisma.chat2Conversation.deleteMany({ where: { id: room } });
      if (pushChatId) await prisma.chat2Conversation.deleteMany({ where: { id: pushChatId } });
    }
    await prisma.$disconnect();
    await pushQueue.close();
    await connection.quit();
  });
  it("rejects a nonmember's subscription JWT", async () => {
    await expect(subscriptionToken(outsider, room)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
  it("delivers a post-commit outbox event over a real authenticated WebSocket to a different user", async () => {
    const [{ token, wsUrl }, { channel, token: subscription }] = await Promise.all([
      connectToken(reader),
      subscriptionToken(reader, room),
    ]);
    const client = new Centrifuge(wsUrl, { token, websocket: WebSocket });
    let onPublished: (messageId: string) => void = () => undefined;
    let state = "connecting";
    const observed = new Promise<string>((resolve) => {
      onPublished = resolve;
    });
    const sub = client.newSubscription(channel, { token: subscription });
    sub.on("publication", (event: { data?: { messageId?: string } }) => {
      if (event.data?.messageId) onPublished(event.data.messageId);
    });
    sub.on("error", (event: { error?: { message?: string } }) => {
      state = `error ${event.error?.message ?? "unknown"}`;
    });
    try {
      const subscribed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Subscription timeout: " + state)), 5000);
        sub.on("subscribed", () => {
          clearTimeout(timer);
          state = "subscribed";
          resolve();
        });
      });
      sub.subscribe();
      client.connect();
      await subscribed;
      const sent = await sendMessage(creator, room, {
        clientMessageId: crypto.randomUUID(),
        text: "Realtime local E2E",
      });
      const processed = await processChat2OutboxOnce(50);
      expect(processed.delivered).toBeGreaterThan(0);
      const delivered = await Promise.race([
        observed,
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error(state + " event timeout")), 5000),
        ),
      ]);
      expect(delivered).toBe(sent.id);
      expect((await messages(reader, room)).some((m) => m.id === delivered)).toBe(true);
      const receipt = await prisma.chat2OutboxEvent.findFirstOrThrow({
        where: { messageId: sent.id },
      });
      expect(receipt.deliveredAt).toBeTruthy();
    } finally {
      client.disconnect();
    }
  });
  it("retries isolated S3 cleanup after a temporary failure on message deletion", async () => {
    const sent = await sendMessage(creator, room, {
      clientMessageId: crypto.randomUUID(),
      text: "Delete my media",
    });
    const key = `chat2/${room}/${creator}/${crypto.randomUUID()}.png`;
    await prisma.chat2Media.create({
      data: {
        conversationId: room,
        messageId: sent.id,
        ownerId: creator,
        objectKey: key,
        name: "test.png",
        kind: "image",
        mime: "image/png",
        bytes: 245,
        status: "READY",
      },
    });
    await deleteMessage(creator, room, sent.id);
    isolatedMedia.remove.mockRejectedValueOnce(
      new Error("isolated media service temporarily unavailable"),
    );
    await processChat2OutboxOnce(50);
    const receipt = await prisma.chat2OutboxEvent.findFirstOrThrow({
      where: { messageId: sent.id, eventType: "message.deleted" },
    });
    expect(receipt.deliveredAt).toBeNull();
    const retained = await prisma.chat2Media.findFirstOrThrow({ where: { messageId: sent.id } });
    expect(retained.status).toBe("REMOVING");
    await prisma.chat2OutboxEvent.update({
      where: { id: receipt.id },
      data: { nextAttemptAt: new Date(Date.now() - 2000) },
    });
    const recovered = await processChat2OutboxOnce(50);
    expect(recovered.delivered).toBeGreaterThan(0);
    expect(isolatedMedia.remove).toHaveBeenCalledWith(key);
    expect(await prisma.chat2Media.count({ where: { messageId: sent.id } })).toBe(0);
    expect(
      (await prisma.chat2OutboxEvent.findUniqueOrThrow({ where: { id: receipt.id } })).deliveredAt,
    ).toBeTruthy();
  });
  it("survives account and room FK cascades and retries S3 cleanup without their rows", async () => {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const owner = await prisma.user.create({
      data: { username: `chat2_deleted_${suffix}`, password: "test-only" },
      select: { id: true },
    });
    let temporaryRoom = "";
    try {
      temporaryRoom = (
        await createGroup(owner.id, {
          name: "Account deletion media test",
          kind: "GROUP",
          visibility: "PRIVATE",
        })
      ).conversationId;
      const first = `chat2/${temporaryRoom}/${owner.id}/${crypto.randomUUID()}.png`;
      const second = `chat2/${temporaryRoom}/${creator}/${crypto.randomUUID()}.pdf`;
      for (const [key, userId, mime] of [
        [first, owner.id, "image/png"],
        [second, creator, "application/pdf"],
      ] as const) {
        await prisma.chat2Media.create({
          data: {
            conversationId: temporaryRoom,
            ownerId: userId,
            objectKey: key,
            name: "private-test-file",
            kind: "file",
            mime,
            bytes: 2048,
            status: "READY",
          },
        });
      }
      // A rolled-back media delete must roll back its trigger-created intent, too.
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.chat2Media.delete({ where: { objectKey: first } });
          throw new Error("LOCAL_ROLLBACK_EXPECTED");
        }),
      ).rejects.toThrow("LOCAL_ROLLBACK_EXPECTED");
      expect(await prisma.chat2Media.count({ where: { objectKey: first } })).toBe(1);
      expect(await prisma.chat2MediaDeletionIntent.count({ where: { objectKey: first } })).toBe(0);
      await prisma.user.delete({ where: { id: owner.id } });
      expect(await prisma.chat2Media.count({ where: { objectKey: first } })).toBe(0);
      expect(
        (await prisma.chat2MediaDeletionIntent.findUniqueOrThrow({ where: { objectKey: first } }))
          .status,
      ).toBe("PENDING");
      // A separate room deletion also cascades Chat2Media, not the independent ledger.
      await prisma.chat2Conversation.delete({ where: { id: temporaryRoom } });
      expect(await prisma.chat2Media.count({ where: { objectKey: second } })).toBe(0);
      expect(
        (await prisma.chat2MediaDeletionIntent.findUniqueOrThrow({ where: { objectKey: second } }))
          .status,
      ).toBe("PENDING");
      // These two rows must be processed ahead of stale disposable rows from
      // earlier interrupted acceptance runs.
      await prisma.chat2MediaDeletionIntent.updateMany({
        where: { objectKey: { in: [first, second] } },
        data: { createdAt: new Date("2000-01-01T00:00:00.000Z") },
      });
      isolatedMedia.remove.mockRejectedValueOnce(new Error("test-only isolated S3 timeout"));
      await processChat2MediaDeletionIntentsOnce(100);
      const initial = await prisma.chat2MediaDeletionIntent.findMany({
        where: { objectKey: { in: [first, second] } },
      });
      expect(initial.some((v) => v.status === "PENDING" && v.attempts === 1)).toBe(true);
      expect(initial.some((v) => v.status === "DONE")).toBe(true);
      await prisma.chat2MediaDeletionIntent.updateMany({
        where: { objectKey: { in: [first, second] }, status: "PENDING" },
        data: { availableAt: new Date(Date.now() - 1000) },
      });
      await processChat2MediaDeletionIntentsOnce(100);
      const recovered = await prisma.chat2MediaDeletionIntent.findMany({
        where: { objectKey: { in: [first, second] } },
      });
      expect(recovered).toHaveLength(2);
      expect(recovered.every((v) => v.status === "DONE" && v.completedAt)).toBe(true);
      expect(isolatedMedia.remove).toHaveBeenCalledWith(first);
      expect(isolatedMedia.remove).toHaveBeenCalledWith(second);
      expect((await processChat2MediaDeletionIntentsOnce(100)).deleted).toBe(0);
    } finally {
      await prisma.chat2Conversation.deleteMany({ where: { id: temporaryRoom } });
      await prisma.user.deleteMany({ where: { id: owner.id } });
    }
  });
  it("records an orphan cleanup when account disappears after S3 upload and immediate delete fails", async () => {
    const username = `chat2_upload_race_${crypto.randomUUID().slice(0, 8)}`;
    const actor = await prisma.user.create({
      data: { username, password: "test-only" },
      select: { id: true },
    });
    let uploadRoom = "";
    try {
      uploadRoom = (
        await createGroup(actor.id, {
          name: "Upload race test",
          kind: "GROUP",
          visibility: "PRIVATE",
        })
      ).conversationId;
      const key = `chat2/${uploadRoom}/${actor.id}/${crypto.randomUUID()}.png`;
      vi.mocked(chat2ReservePrivateObjectKey).mockReturnValueOnce(key);
      vi.mocked(chat2UploadPrivateImageOrPdf).mockImplementationOnce(async () => {
        // Simulate a valid S3 PUT followed by an account deletion before the
        // API can commit the Chat2Media FK row.
        await prisma.user.delete({ where: { id: actor.id } });
        return { objectKey: key, kind: "image", mime: "image/png", bytes: 64 };
      });
      isolatedMedia.remove.mockRejectedValueOnce(
        new Error("isolated delete temporarily unavailable"),
      );
      await expect(
        uploadAttachment(actor.id, uploadRoom, {
          name: "image.png",
          type: "image/png",
          bytes: new Uint8Array(64),
        }),
      ).rejects.toBeDefined();
      expect(await prisma.chat2Media.count({ where: { objectKey: key } })).toBe(0);
      const pending = await prisma.chat2MediaDeletionIntent.findUniqueOrThrow({
        where: { objectKey: key },
      });
      expect(pending.status).toBe("PENDING");
      expect(pending.availableAt.getTime()).toBeLessThanOrEqual(Date.now() + 2000);
      await processChat2MediaDeletionIntentsOnce(100);
      expect(
        (await prisma.chat2MediaDeletionIntent.findUniqueOrThrow({ where: { objectKey: key } }))
          .status,
      ).toBe("PENDING");
      await prisma.chat2MediaDeletionIntent.update({
        where: { objectKey: key },
        data: { availableAt: new Date(Date.now() - 1000) },
      });
      await processChat2MediaDeletionIntentsOnce(100);
      expect(
        (await prisma.chat2MediaDeletionIntent.findUniqueOrThrow({ where: { objectKey: key } }))
          .status,
      ).toBe("DONE");
      expect(isolatedMedia.remove).toHaveBeenCalledWith(key);
    } finally {
      await prisma.chat2Conversation.deleteMany({ where: { id: uploadRoom } });
      await prisma.user.deleteMany({ where: { id: actor.id } });
    }
  });
  it("cleans an expired pre-PUT reservation after an ambiguous upload failure", async () => {
    const key = `chat2/${room}/${creator}/${crypto.randomUUID()}.png`;
    vi.mocked(chat2ReservePrivateObjectKey).mockReturnValueOnce(key);
    vi.mocked(chat2UploadPrivateImageOrPdf).mockRejectedValueOnce(
      new Error("isolated PUT timeout"),
    );
    await expect(
      uploadAttachment(creator, room, {
        name: "image.png",
        type: "image/png",
        bytes: new Uint8Array(64),
      }),
    ).rejects.toThrow("isolated PUT timeout");
    const intent = await prisma.chat2MediaDeletionIntent.findUniqueOrThrow({
      where: { objectKey: key },
    });
    expect(intent.status).toBe("RESERVED");
    expect(intent.availableAt.getTime()).toBeGreaterThan(Date.now() + 90_000);
    await prisma.chat2MediaDeletionIntent.update({
      where: { objectKey: key },
      data: { availableAt: new Date(Date.now() - 1000) },
    });
    await processChat2MediaDeletionIntentsOnce(100);
    expect(
      (await prisma.chat2MediaDeletionIntent.findUniqueOrThrow({ where: { objectKey: key } }))
        .status,
    ).toBe("DONE");
    expect(isolatedMedia.remove).toHaveBeenCalledWith(key);
  });
  it("protects live media from stale reservation and re-arms cleanup after deletion", async () => {
    const key = `chat2/${room}/${creator}/${crypto.randomUUID()}.png`;
    vi.mocked(chat2ReservePrivateObjectKey).mockReturnValueOnce(key);
    vi.mocked(chat2UploadPrivateImageOrPdf).mockResolvedValueOnce({
      objectKey: key,
      kind: "image",
      mime: "image/png",
      bytes: 64,
    });
    await uploadAttachment(creator, room, {
      name: "saved.png",
      type: "image/png",
      bytes: new Uint8Array(64),
    });
    expect(await prisma.chat2Media.count({ where: { objectKey: key } })).toBe(1);
    expect(await prisma.chat2MediaDeletionIntent.count({ where: { objectKey: key } })).toBe(0);
    await prisma.chat2MediaDeletionIntent.create({
      data: { objectKey: key, status: "RESERVED", availableAt: new Date(Date.now() - 1000) },
    });
    const before = isolatedMedia.remove.mock.calls.filter(([value]) => value === key).length;
    await processChat2MediaDeletionIntentsOnce(100);
    expect(isolatedMedia.remove.mock.calls.filter(([value]) => value === key)).toHaveLength(before);
    expect(
      (await prisma.chat2MediaDeletionIntent.findUniqueOrThrow({ where: { objectKey: key } }))
        .status,
    ).toBe("DONE");
    await prisma.chat2Media.delete({ where: { objectKey: key } });
    expect(
      (await prisma.chat2MediaDeletionIntent.findUniqueOrThrow({ where: { objectKey: key } }))
        .status,
    ).toBe("PENDING");
    await processChat2MediaDeletionIntentsOnce(100);
    expect(isolatedMedia.remove.mock.calls.filter(([value]) => value === key)).toHaveLength(
      before + 1,
    );
  });
  it("prunes only old DONE cleanup receipts and recreates the task after a later media DELETE", async () => {
    const prefix = `chat2/retention/${crypto.randomUUID()}`;
    const [old, recent, pending, reserved, withMedia] =
      ["old", "recent", "pending", "reserved", "with-media"].map((n) => `${prefix}/${n}.png`);
    const past = new Date(Date.now() - 45 * 86_400_000);
    const keys = [old, recent, pending, reserved, withMedia];
    try {
      await prisma.chat2Media.create({
        data: {
          conversationId: room,
          ownerId: creator,
          objectKey: withMedia,
          name: "isolated-test.png",
          kind: "image",
          mime: "image/png",
          bytes: 8,
          status: "READY",
        },
      });
      await prisma.chat2MediaDeletionIntent.createMany({
        data: [
          { objectKey: old, status: "DONE", completedAt: past },
          { objectKey: recent, status: "DONE", completedAt: new Date() },
          { objectKey: pending, status: "PENDING", completedAt: past },
          { objectKey: reserved, status: "RESERVED", completedAt: past },
          { objectKey: withMedia, status: "DONE", completedAt: past },
        ],
      });
      const result = await pruneChat2CompletedMediaIntentsOnce(500);
      expect(result.pruned).toBeGreaterThanOrEqual(2);
      expect(
        await prisma.chat2MediaDeletionIntent.findUnique({ where: { objectKey: old } }),
      ).toBeNull();
      expect(
        await prisma.chat2MediaDeletionIntent.findUnique({ where: { objectKey: withMedia } }),
      ).toBeNull();
      for (const key of [recent, pending, reserved]) {
        expect(
          await prisma.chat2MediaDeletionIntent.findUnique({ where: { objectKey: key } }),
        ).toBeTruthy();
      }
      await prisma.chat2Media.delete({ where: { objectKey: withMedia } });
      expect(
        (await prisma.chat2MediaDeletionIntent.findUniqueOrThrow({
          where: { objectKey: withMedia },
        })).status,
      ).toBe("PENDING");
    } finally {
      await prisma.chat2Media.deleteMany({ where: { objectKey: withMedia } });
      await prisma.chat2MediaDeletionIntent.deleteMany({ where: { objectKey: { in: keys } } });
    }
  });
  it("expires a COURSE websocket without login after entitlement is revoked", async () => {
    const suffix = crypto.randomUUID().slice(0, 12);
    const course = await prisma.course.create({
      data: {
        name: `chat2 ws expiry ${suffix}`,
        type: `chat2ws${suffix}`,
        authorId: creator,
        isPrivate: true,
        isPaid: false,
        duration: "1",
        logoImg: "",
        trainingLevel: "BEGINNER",
      },
    });
    let client: InstanceType<typeof Centrifuge> | undefined;
    try {
      await prisma.courseAccess.create({ data: { courseId: course.id, userId: reader } });
      const id = (await openCourse(reader, course.id)).conversationId;
      const [{ token, wsUrl }, { channel, token: issuedToken }] = await Promise.all([
        connectToken(reader),
        subscriptionToken(reader, id),
      ]);
      expect(issuedToken).toBeTruthy();
      // Same server secret and claims as the 60s production token, but short
      // lived to exercise the actual Centrifugo refresh/expiry in local tests.
      const shortToken = await new SignJWT({ channel })
        .setIssuer("gafus-chat2")
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(reader)
        .setIssuedAt()
        .setExpirationTime("5s")
        .sign(new TextEncoder().encode(process.env.CHAT2_CENTRIFUGO_TOKEN_SECRET!));
      client = new Centrifuge(wsUrl, { token, websocket: WebSocket });
      const sub = client.newSubscription(channel, {
        token: shortToken,
        getToken: async () => {
          try {
            return (await subscriptionToken(reader, id)).token;
          } catch {
            return "";
          }
        },
      });
      const subscribed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("course subscription timeout")), 5000);
        sub.on("subscribed", () => { clearTimeout(timer); resolve(); });
      });
      sub.subscribe();
      client.connect();
      await subscribed;
      const expired = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("course refresh revoke timeout")), 16000);
        sub.on("unsubscribed", () => { clearTimeout(timer); resolve(); });
      });
      await prisma.courseAccess.delete({
        where: { courseId_userId: { courseId: course.id, userId: reader } },
      });
      await expect(subscriptionToken(reader, id)).rejects.toMatchObject({
        code: "COURSE_ACCESS_REQUIRED", status: 403,
      });
      await expect(messages(reader, id)).rejects.toMatchObject({ status: 403 });
      await expired;
      expect(sub.state).toBe("unsubscribed");
    } finally {
      client?.disconnect();
      await prisma.course.delete({ where: { id: course.id } });
    }
  }, 30000);
  it("revokes live WebSocket room subscription on group ban", async () => {
    const [{ token, wsUrl }, { channel, token: roomToken }] = await Promise.all([
      connectToken(reader),
      subscriptionToken(reader, room),
    ]);
    const client = new Centrifuge(wsUrl, { token, websocket: WebSocket });
    const sub = client.newSubscription(channel, { token: roomToken });
    try {
      const ready = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("subscribe timeout")), 4500);
        sub.on("subscribed", () => {
          clearTimeout(timer);
          resolve();
        });
      });
      sub.subscribe();
      client.connect();
      await ready;
      const revoked = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("unsubscribe timeout")), 4500);
        sub.on("unsubscribed", () => {
          clearTimeout(timer);
          resolve();
        });
      });
      await moderateGroup(creator, room, reader, "BAN");
      await revoked;
      expect(sub.state).toBe("unsubscribed");
      await expect(messages(reader, room)).rejects.toMatchObject({ status: 404 });
    } finally {
      client.disconnect();
    }
  });
  it("pushes a direct message to its recipient and respects muting", async () => {
    const id = (await openDirect(creator, reader)).conversationId;
    await prisma.pushSubscription.create({
      data: {
        userId: reader,
        endpoint: `https://chat2-dm-no-network-${Date.now()}.example.invalid/push`,
        keys: { p256dh: "local-fake", auth: "local-fake" },
      },
    });
    const sent = await sendMessage(creator, id, {
      clientMessageId: crypto.randomUUID(),
      text: "DM, push recipient",
    });
    expect((await processChat2OutboxOnce(50)).delivered).toBeGreaterThan(0);
    const receipt = await prisma.chat2PushReceipt.findUniqueOrThrow({
      where: {
        messageId_recipientId: { messageId: sent.id, recipientId: reader },
      },
    });
    expect(receipt.notificationId).not.toBeNull();
    directJobId = receipt.notificationId!;
    expect((await Job.fromId(pushQueue, directJobId))?.data.notificationId).toBe(directJobId);
    await muteChat(reader, id, true);
    const muted = await sendMessage(creator, id, {
      clientMessageId: crypto.randomUUID(),
      text: "Muted DM",
    });
    await processChat2OutboxOnce(50);
    expect(
      await prisma.chat2PushReceipt.count({ where: { messageId: muted.id, recipientId: reader } }),
    ).toBe(0);
    await muteChat(reader, id, false);
  });
  it("schedules one actionable push to assigned TRAINER without invoking external providers", async () => {
    await prisma.user.update({ where: { id: creator }, data: { role: "PARTNER" } });
    await prisma.user.update({ where: { id: reader }, data: { role: "TRAINER" } });
    process.env.CYNOLOGIST_CHAT_TRAINER_USER_ID = reader;
    await prisma.pushSubscription.create({
      data: {
        userId: reader,
        endpoint: `https://chat2-no-network-${Date.now()}.example.invalid/push`,
        keys: { p256dh: "fake-local-only", auth: "fake-local-only" },
      },
    });
    pushChatId = (await openCynologist(creator)).conversationId;
    const sent = await sendMessage(creator, pushChatId, {
      clientMessageId: crypto.randomUUID(),
      text: "Сообщение кинологу",
    });
    const published = await processChat2OutboxOnce(50);
    expect(published.delivered).toBeGreaterThan(0);
    const receipt = await prisma.chat2PushReceipt.findUniqueOrThrow({
      where: {
        messageId_recipientId: { messageId: sent.id, recipientId: reader },
      },
    });
    expect(receipt.notificationId).toBeTruthy();
    fakeJobId = receipt.notificationId!;
    const notification = await prisma.stepNotification.findUniqueOrThrow({
      where: { id: fakeJobId },
    });
    expect(notification.jobId).toBe(fakeJobId);
    expect(notification.url).toBe(`/chats/${pushChatId}`);
    expect(notification.type).toBe("immediate");
    const job = await Job.fromId(pushQueue, fakeJobId);
    expect(job?.data).toMatchObject({ notificationId: fakeJobId });
    expect(
      await (
        await import("@gafus/core/services/notifications")
      ).getEligiblePushNotificationJob(fakeJobId, fakeJobId),
    ).toMatchObject({ id: fakeJobId });
    // Running the outbox twice cannot duplicate the push receipt or job.
    await processChat2OutboxOnce(50);
    expect(
      await prisma.chat2PushReceipt.count({ where: { messageId: sent.id, recipientId: reader } }),
    ).toBe(1);
    expect(await prisma.stepNotification.count({ where: { id: fakeJobId } })).toBe(1);
  });
});
