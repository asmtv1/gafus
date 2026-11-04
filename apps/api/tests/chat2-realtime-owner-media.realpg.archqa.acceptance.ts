/**
 * Explicit opt-in real Core+Prisma Chat2 realtime authorization on an OWNED
 * random ephemeral PostgreSQL 18. No preexisting PG, Redis, Centrifugo,
 * network provider, client secrets, or production users/rooms. JWT verification
 * is real; the Centrifugo transport is intentionally NOT simulated as live.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jwtVerify } from "jose";
import { prisma } from "@gafus/prisma";
import { connectToken, subscriptionToken } from "../src/modules/chat2/realtime";
import { chat2V2SourceKey } from "@gafus/feed-cloud";
import { getAttachment } from "../src/modules/chat2/service";
import {
  attachChat2V2Media, discardChat2V2Media, getChat2V2UploadStatus,
  readChat2V2Media, reserveChat2V2Upload, confirmChat2V2Upload,
} from "../src/modules/chat2/media-v2-upload";

const url = process.env.DATABASE_URL ?? "";
const ownDb = process.env.GAFUS_ARCHQA_CHAT2_QUEUE_DB ?? "";
const secret = process.env.CHAT2_CENTRIFUGO_TOKEN_SECRET ?? "";
const allowed = (() => {
  try {
    const parsed = new URL(url);
    return process.env.GAFUS_ARCHQA_REALTIME_ACL === "1" &&
      process.env.GAFUS_ARCHQA_CHAT2_QUEUE_REALPG === "1" &&
      process.env.NODE_ENV === "test" &&
      parsed.protocol === "postgresql:" && parsed.hostname === "127.0.0.1" &&
      parsed.searchParams.get("schema") === "public" &&
      /^archqa_queue_[a-f0-9]{12}$/.test(ownDb) && parsed.pathname === `/${ownDb}` &&
      /^gafus-archqa-only-[A-Za-z0-9_-]{32,}$/.test(secret) &&
      process.env.CHAT2_PUBLIC_WS_URL === "ws://127.0.0.1:9919/connection/websocket" &&
      process.env.CHAT2_V2_MEDIA_ENABLED === "true" &&
      process.env.CHAT2_V2_CORE_ENABLED === "true" &&
      process.env.CHAT2_PROCESSOR_READY === "true";
  } catch { return false; }
})();
if (!allowed) throw Error("CHAT2_REALTIME_OWN_PG_ACL_ENV_REQUIRED");

let actor = "", peer = "", stranger = "", specialist = "";
let room = "", direct = "", specialDirect = "", community = "";
const signature = new TextEncoder().encode(secret);
async function verify(token: string, subject: string, channel?: string) {
  const claims = await jwtVerify(token, signature, {
    issuer: "gafus-chat2", algorithms: ["HS256"],
  });
  expect(claims.payload.sub).toBe(subject);
  if (channel) expect(claims.payload.channel).toBe(channel);
  return claims.payload;
}

beforeAll(async () => {
  const db = await prisma.$queryRawUnsafe<{ db: string }[]>("SELECT current_database() AS db");
  expect(db[0]?.db).toBe(ownDb);
  expect(await prisma.chat2Conversation.count()).toBe(0);
  const salt = randomUUID().replaceAll("-", "").slice(0, 12);
  for (const [which, username, role] of [
    ["actor", `archqa_actor_${salt}`, "USER"],
    ["peer", `archqa_peer_${salt}`, "USER"],
    ["stranger", `archqa_stranger_${salt}`, "USER"],
    ["specialist", "lana", "TRAINER"],
  ] as const) {
    const u = await prisma.user.create({ data: {
      username, role, password: "synthetic-archqa-never-usable",
      email: `archqa_${which}_${salt}@example.invalid`,
    }, select: { id: true } });
    if (which === "actor") actor = u.id;
    if (which === "peer") peer = u.id;
    if (which === "stranger") stranger = u.id;
    if (which === "specialist") specialist = u.id;
  }
  const group = await prisma.chat2Conversation.create({
    data: { kind: "GROUP", visibility: "PRIVATE", createdById: actor,
      name: "Synthetic private room", members: { create: [
        { userId: actor, role: "OWNER" }, { userId: peer, role: "MEMBER" },
      ] } },
    select: { id: true },
  });
  room = group.id;
  direct = (await prisma.chat2Conversation.create({
    data: { kind: "DIRECT", visibility: "PRIVATE", createdById: actor,
      members: { create: [ { userId: actor }, { userId: peer } ] } },
    select: { id: true },
  })).id;
  specialDirect = (await prisma.chat2Conversation.create({
    data: { kind: "DIRECT", visibility: "PRIVATE", createdById: actor,
      members: { create: [ { userId: actor }, { userId: specialist } ] } },
    select: { id: true },
  })).id;
  community = (await prisma.chat2Conversation.create({
    data: { kind: "COMMUNITY", visibility: "PUBLIC", createdById: actor,
      members: { create: [ { userId: actor } ] } },
    select: { id: true },
  })).id;
});
afterAll(async () => { await prisma.$disconnect(); });

describe("real PostgreSQL Chat2 member authorization -> signed realtime JWT", () => {
  it("grants only current private-room members and authenticates exact subject/channel", async () => {
    const grant = await subscriptionToken(peer, room);
    expect(grant.channel).toBe(`chat2:${room}`);
    const jwt = await verify(grant.token, peer, `chat2:${room}`);
    expect((jwt.exp ?? 0) - (jwt.iat ?? 0)).toBe(60);
    await expect(subscriptionToken(stranger, room))
      .rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(subscriptionToken(peer, "nonexistingroom"))
      .rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(jwtVerify(grant.token, new TextEncoder().encode("wrong-key-secret-not-valid-32chars")))
      .rejects.toThrow();
  });
  it("refuses all NEW JWT renewals after real PG group role BAN and allows them after restore", async () => {
    await prisma.chat2Member.update({ where: { conversationId_userId: {
      conversationId: room, userId: peer,
    } }, data: { role: "BANNED" } });
    await expect(subscriptionToken(peer, room))
      .rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await prisma.chat2Member.update({ where: { conversationId_userId: {
      conversationId: room, userId: peer,
    } }, data: { role: "MEMBER" } });
    expect((await subscriptionToken(peer, room)).channel).toBe(`chat2:${room}`);
  });
  it("denies DIRECT when EITHER peer blocks, without leaking room JWT", async () => {
    expect((await subscriptionToken(peer, direct)).channel).toBe(`chat2:${direct}`);
    for (const [blockerId, blockedId] of [[actor, peer], [peer, actor]] as const) {
      await prisma.chat2Block.create({ data: { blockerId, blockedId } });
      await expect(subscriptionToken(peer, direct))
        .rejects.toMatchObject({ code: "BLOCKED", status: 403 });
      await expect(subscriptionToken(actor, direct))
        .rejects.toMatchObject({ code: "BLOCKED", status: 403 });
      await prisma.chat2Block.delete({ where: { blockerId_blockedId: {
        blockerId, blockedId,
      } } });
    }
    expect((await subscriptionToken(actor, direct)).channel).toBe(`chat2:${direct}`);
  });
  it("prevents a stale DIRECT with reserved specialist username from bypassing paid lane", async () => {
    await expect(subscriptionToken(actor, specialDirect))
      .rejects.toMatchObject({ code: "CYNOLOGIST_DIRECT_FORBIDDEN", status: 403 });
    await expect(subscriptionToken(specialist, specialDirect))
      .rejects.toMatchObject({ code: "CYNOLOGIST_DIRECT_FORBIDDEN", status: 403 });
  });
  it("hides a COMMUNITY room immediately after per-user hiddenAt is persisted", async () => {
    expect((await subscriptionToken(actor, community)).channel).toBe(`chat2:${community}`);
    await prisma.chat2Member.update({ where: { conversationId_userId: {
      conversationId: community, userId: actor,
    } }, data: { hiddenAt: new Date() } });
    await expect(subscriptionToken(actor, community))
      .rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });
  it("connection JWT remains only a 5-minute actor grant, not automatic private-room access", async () => {
    const connection = await connectToken(stranger);
    expect(connection.wsUrl).toBe("ws://127.0.0.1:9919/connection/websocket");
    const jwt = await verify(connection.token, stranger);
    expect(jwt.channel).toBeUndefined();
    expect((jwt.exp ?? 0) - (jwt.iat ?? 0)).toBe(300);
    await expect(subscriptionToken(stranger, room))
      .rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });
});


const mediaId = randomUUID();
let attachmentId = "";
describe("real PostgreSQL Chat2 media upload owner ACL and no premature storage grants", () => {
  it("persists one synthetic UPLOADED task, denies peer/outsider owner polling and all unattached media links", async () => {
    const sourceKey = chat2V2SourceKey(room, actor, mediaId, "image/jpeg");
    await prisma.chat2V2MediaTask.create({ data: {
      mediaId, conversationId: room, ownerId: actor,
      name: "synthetic-owner-only.jpg", sourceKey,
      sourceMime: "image/jpeg", sourceBytes: 7168, status: "UPLOADED",
    } });
    expect(await getChat2V2UploadStatus(actor, room, mediaId)).toEqual({
      mediaId, status: "UPLOADED",
    });
    await expect(getChat2V2UploadStatus(peer, room, mediaId))
      .rejects.toMatchObject({ code: "MEDIA_V2_NOT_FOUND", status: 404 });
    await expect(getChat2V2UploadStatus(stranger, room, mediaId))
      .rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(await readChat2V2Media(peer, room, mediaId)).toMatchObject({
      status: "UPLOADED", url: "", expiresIn: 0,
    });
    await expect(getAttachment(actor, room, mediaId))
      .rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND", status: 404 });
  });
  it("cannot attach or confirm another member's upload; owner can attach but not expose unbound data", async () => {
    await expect(attachChat2V2Media(peer, room, mediaId))
      .rejects.toMatchObject({ code: "MEDIA_V2_NOT_READY", status: 409 });
    await expect(confirmChat2V2Upload(peer, room, mediaId))
      .rejects.toMatchObject({ code: "MEDIA_V2_NOT_FOUND", status: 404 });
    await expect(attachChat2V2Media(stranger, room, mediaId))
      .rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    const attached = await attachChat2V2Media(actor, room, mediaId);
    attachmentId = attached.id;
    expect(attached.kind).toBe("image");
    const row = await prisma.chat2Media.findUniqueOrThrow({ where: { id: attachmentId } });
    expect(row.messageId).toBeNull();
    await expect(getAttachment(peer, room, attachmentId))
      .rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND", status: 404 });
    await expect(getAttachment(actor, room, attachmentId))
      .rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND", status: 404 });
    await expect(discardChat2V2Media(peer, room, attachmentId, mediaId))
      .rejects.toMatchObject({ code: "MEDIA_V2_ALREADY_USED", status: 409 });
  });
  it("owner can atomically discard a non-message attachment with cleanup ledger and no S3 request", async () => {
    expect(await discardChat2V2Media(actor, room, attachmentId, mediaId))
      .toEqual({ deleted: true });
    const row = await prisma.chat2V2MediaTask.findUniqueOrThrow({ where: { mediaId } });
    expect(row.status).toBe("EXPIRED");
    expect(row.cleanupKind).toBe("ALL");
    expect(row.cleanupNextAt).not.toBeNull();
    expect(await prisma.chat2Media.findUnique({ where: { id: attachmentId } })).toBeNull();
  });
  it("nonmember and blocked DIRECT cannot reserve new signed S3 uploads", async () => {
    const input = { name: "synthetic.jpg", mime: "image/jpeg", bytes: 7168 };
    const before = await prisma.chat2V2MediaTask.count();
    await expect(reserveChat2V2Upload(stranger, room, input))
      .rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await prisma.chat2Block.create({ data: { blockerId: actor, blockedId: peer } });
    try {
      await expect(reserveChat2V2Upload(peer, direct, input))
        .rejects.toMatchObject({ code: "BLOCKED", status: 403 });
    } finally {
      await prisma.chat2Block.delete({ where: { blockerId_blockedId: {
        blockerId: actor, blockedId: peer,
      } } });
    }
    expect(await prisma.chat2V2MediaTask.count()).toBe(before);
  });
});
