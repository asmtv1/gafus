/** Explicit opted-in local WORK PG18 Core feed; no HTTP/storage or live providers. */
import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { createFeedService } from "./service";
import { createFeedSocial } from "./social";
import { createFeedPreferences } from "./preferences";
import type { FeedStoragePort } from "./ports";

const active = process.env.AG1_FEED_TEXT_WORK_PG === "1" ? describe : describe.skip;
const prefix = "ag1_feed_text_work_20261025_" + randomBytes(5).toString("hex");
const storage: FeedStoragePort = {
  enabled: false,
  presignPost: async () => {
    throw Error("NO_PROVIDER_TEST_ALLOWED");
  },
  head: async () => {
    throw Error("NO_PROVIDER_TEST_ALLOWED");
  },
  // Rendering a text-only DTO still signs a possible author avatar URL.
  // Return a deterministic non-routable marker; no request leaves this process.
  signCdn: async ({ key }) => "https://feed-nonprod.invalid/" + key,
};
const posts = createFeedService({ db: prisma, storage, enabled: () => true });
const social = createFeedSocial({ db: prisma, enabled: () => true });
const prefs = createFeedPreferences({ db: prisma, enabled: () => true });
let author = "",
  reader = "",
  stranger = "",
  postId = "",
  rootCommentId = "",
  replyId = "";
let initialPostCount = 0,
  initialCommentCount = 0;
async function cleanup() {
  const created = [author, reader, stranger].filter(Boolean);
  if (created.length) {
    const reports = await prisma.feedReport.findMany({
      where: { reporterId: { in: created } },
      select: { id: true },
    });
    await prisma.feedModerationAction.deleteMany({
      where: { reportId: { in: reports.map((report) => report.id) } },
    });
    await prisma.feedReport.deleteMany({
      where: { id: { in: reports.map((report) => report.id) } },
    });
    await prisma.feedStorageJob.deleteMany({ where: { ownerId: { in: created } } });
  }
  for (const userId of created) {
    const found = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    if (found?.username.startsWith(prefix)) await prisma.user.delete({ where: { id: userId } });
  }
}
active("Feed text-only Core backed by physical WORK PG18 and no-provider storage", () => {
  beforeAll(async () => {
    const u = new URL(process.env.DATABASE_URL ?? "");
    if (
      !["127.0.0.1", "localhost"].includes(u.hostname) ||
      u.port !== "55921" ||
      u.pathname !== "/gafus_refactor_real_work_20261024"
    )
      throw Error("REFUSE_NON_WORK_PG");
    const meta = await prisma.$queryRaw<{ db: string; version: string }[]>`
   SELECT current_database() AS db,current_setting('server_version_num') AS version`;
    expect(meta).toEqual([{ db: "gafus_refactor_real_work_20261024", version: "180004" }]);
    [initialPostCount, initialCommentCount] = await Promise.all([
      prisma.feedPost.count(),
      prisma.feedComment.count(),
    ]);
    author = randomUUID();
    reader = randomUUID();
    stranger = randomUUID();
    await prisma.user.createMany({
      data: [author, reader, stranger].map((id, index) => ({
        id,
        username: prefix + "_" + index,
        password: "non-login-test-only",
        role: "USER" as const,
        registrationPending: false,
      })),
    });
  }, 30000);
  afterAll(async () => {
    await cleanup();
    expect(await prisma.feedPost.count()).toBe(initialPostCount);
    expect(await prisma.feedComment.count()).toBe(initialCommentCount);
    await prisma.$disconnect();
  }, 30000);
  it("creates one draft for idempotency key; only owner may edit", async () => {
    const clientRequestId = randomUUID();
    const a = await posts.create(author, { clientRequestId });
    const replay = await posts.create(author, { clientRequestId });
    postId = a.id;
    expect(replay.id).toBe(postId);
    expect(await prisma.feedPost.count({ where: { authorId: author } })).toBe(1);
    await expect(
      posts.saveRevision(reader, postId, {
        clientRequestId: randomUUID(),
        expectedVersion: 0,
        text: "Foreign injected",
        attachmentIds: [],
      }),
    ).rejects.toMatchObject({ status: 404 });
    const writeId = randomUUID();
    await posts.saveRevision(author, postId, {
      clientRequestId: writeId,
      expectedVersion: 0,
      text: "AG1 реальный текст Моментов",
      attachmentIds: [],
    });
    await posts.saveRevision(author, postId, {
      clientRequestId: writeId,
      expectedVersion: 0,
      text: "AG1 реальный текст Моментов",
      attachmentIds: [],
    });
    await expect(
      posts.saveRevision(author, postId, {
        clientRequestId: writeId,
        expectedVersion: 0,
        text: "Changed replay",
        attachmentIds: [],
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await prisma.feedPostRevision.count({ where: { postId } })).toBe(1);
  });
  it("publishes first text-only revision, visible to reader; no media API called", async () => {
    await posts.publish(author, postId, { clientRequestId: randomUUID() });
    await posts.publish(author, postId, { clientRequestId: randomUUID() });
    const row = await prisma.feedPost.findUnique({ where: { id: postId } });
    expect(row?.status).toBe("published");
    expect(row?.activeRevisionId).not.toBeNull();
    expect((await posts.get(reader, postId)).text).toBe("AG1 реальный текст Моментов");
    expect((await posts.list(reader, { sort: "new" })).items.some((p) => p.id === postId)).toBe(
      true,
    );
    expect((await posts.listProfile(reader, prefix + "_0")).items.map((i) => i.id)).toContain(
      postId,
    );
  });
  it("comments/replies and duplicate message keys persist one physical SQL row", async () => {
    const key = randomUUID();
    const first = await social.createComment(reader, postId, {
      clientRequestId: key,
      text: "AG1 comment from reader",
    });
    rootCommentId = first.id;
    const repeat = await social.createComment(reader, postId, {
      clientRequestId: key,
      text: "AG1 comment from reader",
    });
    expect(repeat.id).toBe(rootCommentId);
    expect(await prisma.feedComment.count({ where: { postId, authorId: reader } })).toBe(1);
    const reply = await social.createComment(author, postId, {
      clientRequestId: randomUUID(),
      text: "Ответ автора",
      replyToId: rootCommentId,
    });
    replyId = reply.id;
    expect((await prisma.feedComment.findUnique({ where: { id: replyId } }))?.rootId).toBe(
      rootCommentId,
    );
    expect((await social.listReplies(reader, rootCommentId)).items.map((x) => x.id)).toContain(
      replyId,
    );
  });
  it("reaction changed/replayed is one SQL row; view uniquely counted; bookmark owner", async () => {
    const heart = await social.setPostReaction(reader, postId, "❤️");
    expect(heart.reaction).toBe("❤️");
    await social.setPostReaction(reader, postId, "❤️");
    await social.setPostReaction(reader, postId, "😂");
    const reacts = await prisma.feedPostReaction.findMany({ where: { postId, userId: reader } });
    expect(reacts).toHaveLength(1);
    expect(reacts[0]?.kind).toBe("laugh");
    expect((await social.recordView(reader, postId)).counted).toBe(true);
    expect((await social.recordView(reader, postId)).counted).toBe(false);
    expect((await social.recordView(author, postId)).counted).toBe(false);
    expect(await prisma.feedPostView.count({ where: { postId } })).toBe(1);
    await prefs.bookmark(reader, postId, true);
    await prefs.bookmark(reader, postId, true);
    expect(await prisma.feedBookmark.count({ where: { postId, userId: reader } })).toBe(1);
    expect((await posts.list(reader, {}, true)).items.map((i) => i.id)).toContain(postId);
    await social.removePostReaction(reader, postId);
    expect(await prisma.feedPostReaction.count({ where: { postId, userId: reader } })).toBe(0);
  });
  it("hidden author's post is absent, restored visibility works; foreign delete fails", async () => {
    await prefs.preference(reader, author, { hidden: true });
    expect((await posts.list(reader, { sort: "new" })).items.some((p) => p.id === postId)).toBe(
      false,
    );
    await prefs.preference(reader, author, { hidden: false });
    expect((await posts.list(reader, { sort: "new" })).items.some((p) => p.id === postId)).toBe(
      true,
    );
    await expect(posts.remove(stranger, postId)).rejects.toMatchObject({ status: 404 });
    const deleted = await social.deleteComment(reader, rootCommentId);
    expect(deleted.id).toBe(rootCommentId);
    expect(
      (await prisma.feedComment.findUnique({ where: { id: rootCommentId } }))?.deletedAt,
    ).not.toBeNull();
    await posts.remove(author, postId);
    expect((await prisma.feedPost.findUnique({ where: { id: postId } }))?.status).toBe("deleted");
    await expect(posts.get(reader, postId)).rejects.toMatchObject({ status: 404 });
  });
});
