import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@gafus/prisma";
import { createFeedPolls } from "./polls";
import { createFeedService } from "./service";
import { activateFeedPostRevisionTx } from "./publish";
import { createFeedStorageJobs } from "./jobs";

// Only an explicitly selected disposable local DB may run this suite.
const url = process.env.FEED_POLL_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!["postgresql:", "postgres:"].includes(parsed.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    !/^\/gafus_poll_(stage[0-9]*|ci)_[a-z0-9_]+$/.test(parsed.pathname)) {
    throw new Error("Dedicated local gafus_poll_stage/ci test database required");
  }
}
const require = createRequire(new URL("../../../../prisma/package.json", import.meta.url));
const Client = require("@prisma/client").PrismaClient as new (args: {
  datasources: { db: { url: string } };
}) => PrismaClient;
const db = url ? new Client({ datasources: { db: { url } } }) : null;

(url ? describe : describe.skip)("feed polls / isolated PostgreSQL", () => {
  let owner: string, reader: string, stranger: string, postId: string, at: Date;
  const storage = { signCdn: async ({ key }: { key: string; expiresAt: Date }) => `https://cdn.test/${key}` };
  const clock = () => new Date(at);
  function polls() { return createFeedPolls({ db: db!, storage, enabled: () => true, now: clock }); }
  function input() {
    return { expectedVersion: 0, question: "Какой вариант?", isQuiz: true,
      options: [{ text: "Первый", isCorrect: true }, { text: "Второй" }] };
  }
  async function publish() {
    const revision = await db!.feedPostRevision.create({ data: {
      postId, revisionNumber: 1, status: "ready", text: "Тест", clientRequestId: randomUUID(),
    } });
    await db!.feedPost.update({ where: { id: postId }, data: {
      status: "published", activeRevisionId: revision.id, version: 1, publishedAt: at,
    } });
  }
  beforeEach(async () => {
    owner = randomUUID(); reader = randomUUID(); stranger = randomUUID(); postId = randomUUID();
    at = new Date("2026-10-14T12:00:00Z");
    await db!.user.createMany({ data: [owner, reader, stranger].map(id => ({ id, username: `poll-test-${id}`, password: "fixture" })) });
    await db!.feedPost.create({ data: { id: postId, authorId: owner, clientRequestId: randomUUID() } });
  });
  afterEach(async () => {
    // FeedStorageJob snapshots intentionally survive User/Post FK cascades.
    // Delete only jobs belonging to our random fixture post.
    await db!.feedStorageJob.deleteMany({ where: { postId } });
    // Only delete random fixture identities. Cascades remove their posts and polls.
    await db!.user.deleteMany({ where: { id: { in: [owner, reader, stranger] } } });
  });
  afterAll(async () => { await db?.$disconnect(); });

  it("runs upload reservation → processing job → poll-only publish → vote → cleanup", async () => {
    // Real PostgreSQL transactions and worker state machine, synthetic object-store metadata.
    // No request leaves the local database, and no external S3 buckets are touched.
    const photoBytes = 22;
    let sourceKey = "";
    const feed = createFeedService({ db: db!, enabled: () => true, now: clock,
      storage: {
        enabled: true,
        signCdn: storage.signCdn,
        presignPost: async () => ({ url: "https://upload.invalid", fields: {} }),
        head: async key => key === sourceKey
          ? { etag: "test-e2e-etag", bytes: photoBytes, contentType: "image/png" } : null,
      },
    });
    const clientRequestId = randomUUID();
    const uploadInput = { clientRequestId, filename: "answer.png", kind: "photo" as const,
      declaredMime: "image/png" as const, declaredBytes: photoBytes };
    const reserved = await feed.reserveUpload(owner, postId, uploadInput);
    expect(reserved.status).toBe("reserved");
    const repeated = await feed.reserveUpload(owner, postId, uploadInput);
    expect(repeated.mediaId).toBe(reserved.mediaId);
    expect(repeated.uploadId).toBe(reserved.uploadId);
    sourceKey = (await db!.feedUpload.findUniqueOrThrow({ where: { id: reserved.uploadId } })).sourceKey;
    await feed.completeUpload(owner, reserved.uploadId);
    expect((await feed.getUpload(owner, reserved.uploadId)).status).toBe("uploaded");
    const job = await db!.feedStorageJob.findUniqueOrThrow({
      where: { dedupeKey: `feed-process:${reserved.uploadId}` },
    });
    const token = randomUUID();
    await db!.feedStorageJob.update({ where: { id: job.id }, data: {
      status: "processing", attempts: 1, attemptToken: token,
      leaseUntil: new Date(at.getTime() + 60_000),
    } });
    const base = `posts/${owner}/${postId}/attachments/${reserved.mediaId}`;
    const worker = createFeedStorageJobs({ db: db!, now: clock });
    expect(await worker.complete(job.id, token, {
      width: 300, height: 200, thumbKey: `${base}/thumb.webp`, fullKey: `${base}/full.webp`,
    })).toEqual({ accepted: true });
    expect((await feed.getUpload(owner, reserved.uploadId)).status).toBe("ready");
    expect((await feed.reserveUpload(owner, postId, uploadInput)).mediaId).toBe(reserved.mediaId);
    const poll = await polls().save(owner, postId, { expectedVersion: 0,
      question: "Кто на фото?", options: [
        { text: "Собака", imageMediaId: reserved.mediaId }, { text: "Кошка" },
      ],
    });
    expect(poll.options[0]?.imageUrl).toContain(`${base}/thumb.webp`);
    await feed.saveRevision(owner, postId, {
      clientRequestId: randomUUID(), expectedVersion: 0, text: "", attachmentIds: [], pollOnly: true,
    });
    await feed.publish(owner, postId, { clientRequestId: randomUUID() });
    const published = await feed.get(reader, postId);
    expect(published).toMatchObject({
      status: "published", hasPoll: true, text: "Опрос", attachments: [],
    });
    const remotePoll = await polls().get(reader, postId);
    expect(remotePoll.options[0]?.imageUrl).toContain(`${base}/thumb.webp`);
    expect((await polls().vote(reader, postId, { optionIds: [remotePoll.options[0]!.id] })).myOptionIds)
      .toEqual([remotePoll.options[0]!.id]);
    await feed.remove(owner, postId);
    expect((await db!.feedStorageJob.findMany({
      where: { postId, kind: "delete_keys" }, select: { sourceKeys: true },
    })).some(item => item.sourceKeys.includes(`${base}/thumb.webp`))).toBe(true);
    await expect(polls().get(reader, postId)).rejects.toMatchObject({ status: 404 });
    await expect(feed.fallbackSource(reader, reserved.mediaId, "thumb"))
      .rejects.toMatchObject({ status: 404 });
  });

  it("enforces author-only draft editing, publishing immutability and one vote", async () => {
    const p = polls();
    await expect(p.save(reader, postId, input())).rejects.toMatchObject({ status: 404 });
    const draft = await p.save(owner, postId, input());
    expect(draft).toMatchObject({ question: "Какой вариант?", canEdit: true, totalVotes: 0 });
    const replay = await p.save(owner, postId, input());
    expect(replay.id).toBe(draft.id);
    expect(replay.options.map(option => option.id)).toEqual(draft.options.map(option => option.id));
    await expect(p.get(reader, postId)).rejects.toMatchObject({ status: 404 });
    const second = await p.save(owner, postId, { ...input(), question: "Новая формулировка" });
    expect(second.question).toBe("Новая формулировка");
    await publish();
    await expect(p.remove(owner, postId)).rejects.toMatchObject({ status: 409 });
    await expect(p.save(owner, postId, input())).rejects.toMatchObject({ status: 409 });
    const publicPoll = await p.get(reader, postId);
    expect(publicPoll).toMatchObject({ totalVotes: null, canEdit: false, explanation: null });
    expect(publicPoll.options.every(row => row.isCorrect === undefined && row.votes === null)).toBe(true);
    await expect(p.vote(reader, postId, { optionIds: ["wrong"] })).rejects.toMatchObject({ status: 400 });
    await expect(p.vote(reader, postId, { optionIds: publicPoll.options.map(row => row.id) })).rejects.toMatchObject({ status: 400 });
    const voted = await p.vote(reader, postId, { optionIds: [publicPoll.options[0]!.id] });
    expect(voted).toMatchObject({ totalVotes: 1, myOptionIds: [publicPoll.options[0]!.id] });
    expect(voted.options[0]?.isCorrect).toBe(true);
    await expect(p.vote(reader, postId, { optionIds: [publicPoll.options[1]!.id] })).rejects.toMatchObject({ code: "ALREADY_VOTED", status: 409 });
    const strangerView = await p.get(stranger, postId);
    expect(strangerView.myOptionIds).toEqual([]);
    expect(strangerView.options[0]?.isCorrect).toBeUndefined();
    expect(strangerView.totalVotes).toBeNull();
  });

  it("publishes a poll-only post but rejects a forged empty ordinary post", async () => {
    const p = polls();
    const feed = createFeedService({ db: db!, enabled: () => true, now: clock,
      storage: { enabled: true, signCdn: storage.signCdn,
        head: async () => null, presignPost: async () => ({ url: "https://test.invalid", fields: {} }) },
    });
    const rev = { clientRequestId: randomUUID(), expectedVersion: 0, text: "", attachmentIds: [], pollOnly: true as const };
    await expect(feed.saveRevision(owner, postId, rev)).rejects.toMatchObject({ code: "EMPTY_POST" });
    await p.save(owner, postId, { expectedVersion: 0, question: "Какой ответ?", options: [
      { text: "Да" }, { text: "Нет" },
    ] });
    await feed.saveRevision(owner, postId, rev);
    await feed.publish(owner, postId, { clientRequestId: randomUUID() });
    const published = await feed.get(reader, postId);
    expect(published).toMatchObject({ status: "published", text: "Опрос", hasPoll: true });
    expect((await p.get(reader, postId)).options).toHaveLength(2);
  });

  it("refuses to publish a poll-only revision after its poll is removed", async () => {
    const p = polls();
    const feed = createFeedService({ db: db!, enabled: () => true, now: clock,
      storage: { enabled: true, signCdn: storage.signCdn,
        head: async () => null, presignPost: async () => ({ url: "https://test.invalid", fields: {} }) },
    });
    await p.save(owner, postId, { expectedVersion: 0, question: "Вопрос", options: [
      { text: "Первый" }, { text: "Второй" },
    ] });
    await feed.saveRevision(owner, postId, {
      clientRequestId: randomUUID(), expectedVersion: 0, text: "", attachmentIds: [], pollOnly: true,
    });
    await p.remove(owner, postId);
    await expect(feed.publish(owner, postId, { clientRequestId: randomUUID() }))
      .rejects.toMatchObject({ code: "EMPTY_POST" });
  });

  it("allows author-only removal of an unpublished poll without removing its post", async () => {
    const p = polls();
    await p.save(owner, postId, input());
    await expect(p.remove(reader, postId)).rejects.toMatchObject({ status: 404 });
    expect(await p.remove(owner, postId)).toEqual({ removed: true });
    await expect(p.get(owner, postId)).rejects.toMatchObject({ status: 404 });
    expect(await db!.feedPost.findUnique({ where: { id: postId } })).not.toBeNull();
  });

  it("shuffles choices deterministically per viewer and preserves the displayed order", async () => {
    const p = polls();
    await p.save(owner, postId, { expectedVersion: 0, question: "Перемешать?", shuffleOptions: true,
      options: Array.from({ length: 8 }, (_, i) => ({ text: `Вариант ${i + 1}` })),
    });
    await publish();
    const first = await p.get(reader, postId);
    const second = await p.get(reader, postId);
    expect(second.options.map(option => option.id)).toEqual(first.options.map(option => option.id));
    const rank = (id: string) => createHash("sha256")
      .update(`${first.id}:${reader}:${id}`).digest("hex");
    expect(first.options.map(option => option.id)).toEqual(
      first.options.map(option => option.id).sort((a, b) => rank(a).localeCompare(rank(b))),
    );
    const another = await p.get(stranger, postId);
    const rankStranger = (id: string) => createHash("sha256")
      .update(`${another.id}:${stranger}:${id}`).digest("hex");
    expect(another.options.map(option => option.id)).toEqual(
      another.options.map(option => option.id).sort((a, b) => rankStranger(a).localeCompare(rankStranger(b))),
    );
  });

  it("accepts only one of two simultaneous votes from the same account", async () => {
    const p = polls();
    await p.save(owner, postId, { expectedVersion: 0, question: "Выберите", options: [
      { text: "Первый" }, { text: "Второй" },
    ] });
    await publish();
    const choice = (await p.get(reader, postId)).options[0]!.id;
    const attempts = await Promise.allSettled([
      p.vote(reader, postId, { optionIds: [choice] }),
      p.vote(reader, postId, { optionIds: [choice] }),
    ]);
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await db!.feedPollVote.count({ where: { userId: reader } })).toBe(1);
    expect(await db!.feedPollVoteSelection.count({ where: { userId: reader } })).toBe(1);
  });

  it("enforces hidden results, poll closing, moderation and soft deletion", async () => {
    const p = polls();
    await p.save(owner, postId, { ...input(), hideResults: true,
      endDate: "2026-10-15T12:00:00.000Z", isAnonymous: true });
    await publish();
    const options = (await p.get(reader, postId)).options;
    const afterVote = await p.vote(reader, postId, { optionIds: [options[0]!.id] });
    expect(afterVote.totalVotes).toBeNull();
    expect(afterVote.options[0]!.isCorrect).toBeUndefined();
    at = new Date("2026-10-16T00:00:00Z");
    const ended = await p.get(stranger, postId);
    expect(ended.closed).toBe(true);
    expect(ended.totalVotes).toBe(1);
    expect(ended.options[0]!.isCorrect).toBe(true);
    await expect(p.vote(stranger, postId, { optionIds: [options[1]!.id] })).rejects.toMatchObject({ code: "POLL_CLOSED" });
    await db!.feedPost.update({ where: { id: postId }, data: { moderationState: "hidden" } });
    await expect(p.get(reader, postId)).rejects.toMatchObject({ status: 404 });
    await db!.feedPost.update({ where: { id: postId }, data: { moderationState: "visible", status: "deleted", deletedAt: at } });
    await expect(p.get(reader, postId)).rejects.toMatchObject({ status: 404 });
    await expect(p.vote(stranger, postId, { optionIds: [options[1]!.id] })).rejects.toMatchObject({ status: 404 });
  });

  it("keeps dedicated poll images across text revisions, but blocks unavailable photos", async () => {
    const p = polls();
    const mediaId = randomUUID();
    await db!.feedMediaAsset.create({ data: {
      id: mediaId, postId, ownerId: owner, kind: "photo", status: "ready", thumbKey: "posts/test/poll/thumb.webp", fullKey: "posts/test/poll/full.webp",
    } });
    const original = await db!.feedPostRevision.create({ data: {
      postId, revisionNumber: 1, status: "draft", text: "С фото", clientRequestId: randomUUID(),
      attachments: { create: [{ mediaId, position: 0 }] },
    } });
    await db!.feedPost.update({ where: { id: postId }, data: { version: 1 } });
    await p.save(owner, postId, { expectedVersion: 1, question: "Фото", options: [
      { text: "Первый", imageMediaId: mediaId }, { text: "Второй" },
    ] });
    const newRevision = await db!.feedPostRevision.create({ data: {
      postId, revisionNumber: 2, status: "pending", text: "Без фото", clientRequestId: randomUUID(),
    } });
    await db!.feedPost.update({ where: { id: postId }, data: { version: 2 } });
    await db!.feedMediaAsset.update({ where: { id: mediaId }, data: { status: "failed" } });
    await expect(db!.$transaction(async tx => activateFeedPostRevisionTx(tx, {
      post: { id: postId, authorId: owner, publishedAt: null },
      revisionId: newRevision.id, text: "Без фото", publishedMediaCount: 0, at,
    }))).rejects.toMatchObject({ status: 400 });
    expect((await db!.feedPostRevision.findUniqueOrThrow({ where: { id: newRevision.id } })).status).toBe("pending");
    expect((await db!.feedPost.findUniqueOrThrow({ where: { id: postId } })).activeRevisionId).toBeNull();
    expect(original.id).toBeTruthy();
  });

  it("publishes a dedicated poll option photo without adding it to the regular post gallery", async () => {
    const p = polls();
    const mediaId = randomUUID();
    const thumbKey = `posts/${owner}/${postId}/attachments/${mediaId}/thumb.webp`;
    const fullKey = `posts/${owner}/${postId}/attachments/${mediaId}/full.webp`;
    await db!.feedMediaAsset.create({ data: {
      id: mediaId, postId, ownerId: owner, kind: "photo", status: "ready", thumbKey, fullKey,
    } });
    const feed = createFeedService({ db: db!, enabled: () => true, now: clock,
      storage: { enabled: true, signCdn: storage.signCdn,
        head: async () => null, presignPost: async () => ({ url: "https://test.invalid", fields: {} }) },
    });
    const saved = await p.save(owner, postId, { expectedVersion: 0, question: "Кто здесь?", options: [
      { text: "Собака", imageMediaId: mediaId }, { text: "Кот" },
    ] });
    expect(saved.options[0]?.imageMediaId).toBe(mediaId);
    await feed.saveRevision(owner, postId, {
      expectedVersion: 0, text: "", attachmentIds: [], pollOnly: true, clientRequestId: randomUUID(),
    });
    await feed.publish(owner, postId, { clientRequestId: randomUUID() });
    const post = await feed.get(reader, postId);
    expect(post.hasPoll).toBe(true);
    expect(post.attachments).toHaveLength(0);
    const displayed = await p.get(reader, postId);
    expect(displayed.options[0]?.imageUrl).toContain(thumbKey);
    expect(await feed.fallbackSource(reader, mediaId, "thumb")).toEqual({ key: thumbKey });
    expect(await feed.fallbackSource(reader, mediaId, "full")).toEqual({ key: fullKey });
    const unusedMediaId = randomUUID();
    await db!.feedMediaAsset.create({ data: {
      id: unusedMediaId, postId, ownerId: owner, kind: "photo", status: "ready",
      thumbKey: `posts/${owner}/${postId}/attachments/${unusedMediaId}/thumb.webp`,
      fullKey: `posts/${owner}/${postId}/attachments/${unusedMediaId}/full.webp`,
    } });
    await expect(feed.fallbackSource(reader, unusedMediaId, "thumb"))
      .rejects.toMatchObject({ status: 404 });
  });

  it("rejects images from another post or pending assets and signs only owned revision media", async () => {
    const p = polls();
    const secondPost = await db!.feedPost.create({ data: { authorId: owner, clientRequestId: randomUUID() } });
    const ownMediaId = randomUUID(), wrongMediaId = randomUUID();
    await db!.feedMediaAsset.createMany({ data: [
      { id: ownMediaId, postId, ownerId: owner, kind: "photo", status: "ready", thumbKey: "posts/test/own/thumb.webp", fullKey: "posts/test/own/full.webp" },
      { id: wrongMediaId, postId: secondPost.id, ownerId: owner, kind: "photo", status: "ready", thumbKey: "posts/test/wrong/thumb.webp", fullKey: "posts/test/wrong/full.webp" },
    ] });
    const revision = await db!.feedPostRevision.create({ data: {
      postId, revisionNumber: 1, status: "draft", text: "С изображением", clientRequestId: randomUUID(),
      attachments: { create: [{ mediaId: ownMediaId, position: 0 }] },
    } });
    await db!.feedPost.update({ where: { id: postId }, data: { version: 1 } });
    const base = { expectedVersion: 1, question: "Фото?", options: [
      { text: "Первый", imageMediaId: wrongMediaId }, { text: "Второй" },
    ] };
    await expect(p.save(owner, postId, base)).rejects.toMatchObject({ status: 400 });
    const own = await p.save(owner, postId, { ...base, options: [
      { text: "Первый", imageMediaId: ownMediaId }, { text: "Второй" },
    ] });
    expect(own.options[0]?.imageUrl).toBe("https://cdn.test/posts/test/own/thumb.webp");
    await db!.feedPostRevision.update({ where: { id: revision.id }, data: { status: "ready" } });
    await db!.feedPost.update({ where: { id: postId }, data: {
      activeRevisionId: revision.id, publishedAt: at, status: "published",
    } });
    expect((await p.get(reader, postId)).options[0]?.imageUrl).toContain("own/thumb.webp");
  });
});
