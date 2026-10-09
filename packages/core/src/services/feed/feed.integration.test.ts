import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@gafus/prisma";
import { createFeedService } from "./service";
import { createFeedSocial } from "./social";
import { enqueueFeedAccountCleanup } from "./cleanup";
import { createFeedStorageJobs } from "./jobs";
import type { FeedStoragePort } from "./ports";

// Never infer a database from the application's environment or reset shared schemas.
const url = process.env.FEED_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!["postgresql:", "postgres:"].includes(parsed.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || parsed.pathname !== "/feed_test")
    throw new Error("Dedicated local feed_test database required");
}
const require = createRequire(new URL("../../../../prisma/package.json", import.meta.url));
const Client = require("@prisma/client").PrismaClient as new (args: { datasources: { db: { url: string } } }) => PrismaClient;
const db = url ? new Client({ datasources: { db: { url } } }) : null;
(url ? describe : describe.skip)("feed / real PostgreSQL", () => {
  let owner: string, reader: string, stranger: string, at: Date;
  let posts: ReturnType<typeof createFeedService>, social: ReturnType<typeof createFeedSocial>;
  const objects = new Map<string, { etag: string; bytes: number; contentType: string }>();
  const storage: FeedStoragePort = { enabled: true,
    presignPost: async ({ key }) => ({ url: "https://storage.test", fields: { key } }),
    head: async key => objects.get(key) ?? null,
    signCdn: async ({ key }) => `https://cdn.test/${key}`,
  };
  beforeEach(async () => {
    owner = randomUUID(); reader = randomUUID(); stranger = randomUUID(); at = new Date("2026-10-09T12:00:00Z");
    objects.clear();
    await db!.user.createMany({ data: [owner, reader, stranger].map(id => ({ id, username: `feed-test-${id}`, password: "fixture" })) });
    posts = createFeedService({ db: db!, storage, enabled: () => true, now: () => new Date(at) });
    social = createFeedSocial({ db: db!, enabled: () => true, now: () => new Date(at) });
  });
  afterEach(async () => {
    await db!.feedStorageJob.deleteMany({ where: { ownerId: { in: [owner, reader, stranger] } } });
    await db!.user.deleteMany({ where: { id: { in: [owner, reader, stranger] } } });
  });
  afterAll(async () => { await db?.$disconnect(); });
  async function publish(text = "Публикация") {
    const draft = await posts.create(owner, { clientRequestId: randomUUID() });
    await posts.saveRevision(owner, draft.id, { clientRequestId: randomUUID(), expectedVersion: 0, text, attachmentIds: [] });
    await posts.publish(owner, draft.id, { clientRequestId: randomUUID() });
    return posts.get(reader, draft.id);
  }
  it("serializes duplicate creation requests", async () => {
    const input = { clientRequestId: randomUUID() };
    const drafts = await Promise.all(Array.from({ length: 5 }, () => posts.create(owner, input)));
    expect(new Set(drafts.map(x => x.id)).size).toBe(1);
  });
  it("keeps drafts private and forbids another author editing", async () => {
    const draft = await posts.create(owner, { clientRequestId: randomUUID() });
    await expect(posts.get(reader, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(posts.editor(reader, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(posts.remove(reader, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("resolves concurrent revision writes with a single winner", async () => {
    const post = await publish();
    const results = await Promise.allSettled(["Первое", "Второе"].map(text => posts.saveRevision(owner, post.id,
      { clientRequestId: randomUUID(), expectedVersion: 1, text, attachmentIds: [] })));
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(x => x.status === "rejected")).toHaveLength(1);
  });
  it("rejects a changed request with the same idempotency key", async () => {
    const post = await publish(); const clientRequestId = randomUUID();
    const input = { clientRequestId, expectedVersion: 1, text: "Правка", attachmentIds: [] };
    await posts.saveRevision(owner, post.id, input);
    await posts.saveRevision(owner, post.id, input);
    await expect(posts.saveRevision(owner, post.id, { ...input, text: "Другая" })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
  it("enforces the edit boundary and preserves original publication date", async () => {
    const post = await publish(); at = new Date(at.getTime() + 3_599_999);
    await posts.saveRevision(owner, post.id, { clientRequestId: randomUUID(), expectedVersion: 1, text: "Правка", attachmentIds: [] });
    await posts.publish(owner, post.id, { clientRequestId: randomUUID() });
    const edited = await posts.get(reader, post.id);
    expect(edited.publishedAt).toBe(post.publishedAt); expect(edited.editedAt).toBe(at.toISOString());
    at = new Date(at.getTime() + 1);
    await expect(posts.saveRevision(owner, post.id, { clientRequestId: randomUUID(), expectedVersion: 2, text: "Поздно", attachmentIds: [] }))
      .rejects.toMatchObject({ code: "EDIT_WINDOW_CLOSED" });
  });
  it("deduplicates concurrent views and excludes author views", async () => {
    const post = await publish();
    await Promise.all(Array.from({ length: 5 }, () => social.recordView(reader, post.id)));
    await social.recordView(owner, post.id);
    expect((await posts.get(reader, post.id)).viewCount).toBe(1);
  });
  it("stores one reaction per reader and permits changing/removing", async () => {
    const post = await publish();
    await Promise.all(Array.from({ length: 4 }, () => social.setPostReaction(reader, post.id, "❤️")));
    expect(await db!.feedPostReaction.count({ where: { postId: post.id } })).toBe(1);
    await social.setPostReaction(reader, post.id, "🐶");
    expect((await posts.get(reader, post.id)).myReaction).toBe("🐶");
    await social.removePostReaction(reader, post.id);
    expect((await posts.get(reader, post.id)).myReaction).toBeNull();
  });
  it("lets the post author remove comments but not strangers", async () => {
    const post = await publish();
    const comment = await social.createComment(reader, post.id, { clientRequestId: randomUUID(), text: "Комментарий" });
    await expect(social.deleteComment(stranger, comment.id)).rejects.toBeDefined();
    await social.deleteComment(owner, comment.id);
    expect((await social.listComments(reader, post.id)).items.filter(x => !x.deleted)).toHaveLength(0);
  });
  it("hides a deleted post and its interactions immediately", async () => {
    const post = await publish(); await posts.remove(owner, post.id);
    await expect(posts.get(reader, post.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(social.setPostReaction(reader, post.id, "❤️")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await posts.list(reader)).items.some(x => x.id === post.id)).toBe(false);
  });
  it("publishes media only after an authorized job completes", async () => {
    const draft = await posts.create(owner, { clientRequestId: randomUUID() });
    const upload = await posts.reserveUpload(owner, draft.id, { clientRequestId: randomUUID(), kind: "photo", filename: "photo.jpg", declaredMime: "image/jpeg", declaredBytes: 100 });
    const row = await db!.feedUpload.findUniqueOrThrow({ where: { id: upload.uploadId } });
    objects.set(row.sourceKey, { bytes: 100, contentType: "image/jpeg", etag: "test-etag" });
    await posts.completeUpload(owner, upload.uploadId);
    await posts.saveRevision(owner, draft.id, { clientRequestId: randomUUID(), expectedVersion: 0, text: "Фото", attachmentIds: [row.mediaId] });
    await posts.publish(owner, draft.id, { clientRequestId: randomUUID() });
    await expect(posts.get(reader, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const jobs = createFeedStorageJobs({ db: db!, now: () => new Date(at) });
    await db!.feedStorageJob.updateMany({ where: { uploadId: upload.uploadId }, data: { availableAt: at } });
    const [claim] = await jobs.claim(1);
    expect(await jobs.complete(claim.id, randomUUID(), { width: 100, height: 100 })).toEqual({ accepted: false });
    const prefix = `posts/${owner}/${draft.id}/attachments/${row.mediaId}`;
    expect(await jobs.complete(claim.id, claim.attemptToken, { width: 100, height: 100, thumbKey: `${prefix}/thumb.webp`, fullKey: `${prefix}/full.webp` })).toEqual({ accepted: true });
    expect((await posts.get(reader, draft.id)).attachments[0].status).toBe("ready");
  });
  it("snapshots in-flight media cleanup before account cascade", async () => {
    const draft = await posts.create(owner, { clientRequestId: randomUUID() });
    const upload = await posts.reserveUpload(owner, draft.id, { clientRequestId: randomUUID(), kind: "video", filename: "clip.mp4", declaredMime: "video/mp4", declaredBytes: 100 });
    await db!.$transaction(async tx => {
      await enqueueFeedAccountCleanup(tx, owner, at);
      await tx.user.delete({ where: { id: owner } });
    });
    expect(await db!.feedMediaAsset.count({ where: { ownerId: owner } })).toBe(0);
    const cleanup = await db!.feedStorageJob.findMany({ where: { ownerId: owner, kind: "delete_keys" } });
    expect(cleanup.length).toBeGreaterThanOrEqual(65);
    const keys = cleanup.flatMap(item => item.sourceKeys);
    expect(keys.some(key => key.endsWith("/hls/segment-059.ts"))).toBe(true);
    expect(keys.some(key => key.includes("/incoming/"))).toBe(true);
    expect(keys.every(key => key.startsWith(`posts/${owner}/`))).toBe(true);
    expect(cleanup.every(item => item.availableAt.getTime() > at.getTime())).toBe(true);
    expect(await db!.feedUpload.findUnique({ where: { id: upload.uploadId } })).toBeNull();
  });
  it("authorizes playback only for video in the active published revision", async () => {
    const draft = await posts.create(owner, { clientRequestId: randomUUID() });
    const mediaId = randomUUID(); const prefix = `posts/${owner}/${draft.id}/attachments/${mediaId}/`;
    await db!.feedMediaAsset.create({ data: { id: mediaId, ownerId: owner, postId: draft.id, kind: "video", status: "ready",
      width: 320, height: 240, durationSeconds: 3, posterKey: prefix + "poster.webp", playlistKey: prefix + "hls/playlist.m3u8",
      videoSegmentKeys: [prefix + "hls/segment-000.ts"] } });
    await expect(posts.playbackSource(reader, mediaId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await posts.saveRevision(owner, draft.id, { clientRequestId: randomUUID(), expectedVersion: 0, text: "Видео", attachmentIds: [mediaId] });
    await posts.publish(owner, draft.id, { clientRequestId: randomUUID() });
    expect((await posts.playbackSource(reader, mediaId)).playlistKey).toBe(prefix + "hls/playlist.m3u8");
    await posts.saveRevision(owner, draft.id, { clientRequestId: randomUUID(), expectedVersion: 1, text: "Теперь без видео", attachmentIds: [] });
    await posts.publish(owner, draft.id, { clientRequestId: randomUUID() });
    await expect(posts.playbackSource(reader, mediaId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

});
