import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@gafus/prisma";
import { createFeedService } from "./service";
import { createFeedPreferences } from "./preferences";
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
    const reports = await db!.feedReport.findMany({ where: { reporterId: { in: [owner, reader, stranger] } }, select: { id: true } });
    await db!.feedModerationAction.deleteMany({ where: { reportId: { in: reports.map(row => row.id) } } });
    await db!.feedReport.deleteMany({ where: { id: { in: reports.map(row => row.id) } } });
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
  it("orders the full feed by newest, reactions or visible comments with paginated cursors", async () => {
    const first = await publish("Первый");
    at = new Date(at.getTime() + 60_000);
    const second = await publish("Второй");
    at = new Date(at.getTime() + 60_000);
    const third = await publish("Третий");

    await social.setPostReaction(reader, first.id, "❤️");
    await social.setPostReaction(stranger, first.id, "🔥");
    await social.setPostReaction(reader, second.id, "❤️");
    await social.createComment(reader, first.id, { text: "Первый ответ", clientRequestId: randomUUID() });
    await social.createComment(reader, second.id, { text: "Второй ответ", clientRequestId: randomUUID() });
    await social.createComment(stranger, second.id, { text: "Ещё ответ", clientRequestId: randomUUID() });

    expect((await posts.list(reader, { sort: "new" })).items.map(post => post.id))
      .toEqual([third.id, second.id, first.id]);
    expect((await posts.list(reader, { sort: "popular" })).items.map(post => post.id))
      .toEqual([first.id, second.id, third.id]);
    expect((await posts.list(reader, { sort: "discussed" })).items.map(post => post.id))
      .toEqual([second.id, first.id, third.id]);
    for (const [sort, expected] of [
      ["popular", [first.id, second.id, third.id]],
      ["discussed", [second.id, first.id, third.id]],
    ] as const) {
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await posts.list(reader, { sort, pageSize: 1, cursor });
        ids.push(...page.items.map(post => post.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(ids).toEqual([...expected]);
    }
  });
  it("hides current/future posts for one reader while preserving profiles, links and bookmarks", async () => {
    const prefs = createFeedPreferences({ db: db!, enabled: () => true });
    const post = await publish();
    await prefs.bookmark(reader, post.id, true);
    await prefs.preference(reader, owner, { hidden: true });
    const future = await publish("Новая публикация");
    expect((await posts.list(reader)).items.filter(row => row.author.id === owner)).toHaveLength(0);
    expect((await posts.list(stranger)).items.filter(row => row.author.id === owner)).toHaveLength(2);
    expect((await posts.list(reader, {}, true)).items.map(row => row.id)).toEqual([post.id]);
    expect((await posts.listProfile(reader, `feed-test-${owner}`)).items).toHaveLength(2);
    expect((await posts.get(reader, future.id)).id).toBe(future.id);
    await prefs.preference(reader, owner, { hidden: false });
    expect((await posts.list(reader)).items.filter(row => row.author.id === owner)).toHaveLength(2);
  });
  it("keeps evidence after editing, suppresses hidden post interactions and restores it", async () => {
    const prefs = createFeedPreferences({ db: db!, enabled: () => true });
    const post = await publish("До редактирования");
    const report = await prefs.report(reader, "post", post.id, { reason: "spam" });
    expect(await prefs.report(reader, "post", post.id, { reason: "other" })).toEqual(report);
    await posts.saveRevision(owner, post.id, { clientRequestId: randomUUID(), expectedVersion: 1, text: "После редактирования", attachmentIds: [] });
    expect((await db!.feedReport.findUniqueOrThrow({ where: { id: report.id } })).snapshotText).toBe("До редактирования");
    await expect(prefs.moderate(reader, report.id, { action: "hide", reason: "Спам" })).rejects.toMatchObject({ status: 403 });
    await db!.user.update({ where: { id: stranger }, data: { role: "MODERATOR" } });
    await prefs.moderate(stranger, report.id, { action: "hide", reason: "Спам" });
    await expect(posts.get(reader, post.id)).rejects.toMatchObject({ status: 404 });
    await expect(social.createComment(reader, post.id, { text: "Ответ", clientRequestId: randomUUID() })).rejects.toMatchObject({ status: 404 });
    expect((await posts.listProfile(owner, `feed-test-${owner}`)).items[0]).toMatchObject({ moderationState: "hidden", moderationReason: "Спам", canEdit: false });
    expect((await posts.listProfile(reader, `feed-test-${owner}`)).items).toHaveLength(0);
    await prefs.moderate(stranger, report.id, { action: "restore", reason: "Проверено" });
    expect((await posts.get(reader, post.id)).moderationState).toBe("visible");
  });
  it("moderates comments without exposing hidden text and supports publishing bans", async () => {
    const prefs = createFeedPreferences({ db: db!, enabled: () => true });
    const post = await publish();
    const comment = await social.createComment(reader, post.id, { text: "Спам в комментарии", clientRequestId: randomUUID() });
    const report = await prefs.report(owner, "comment", comment.id, { reason: "spam" });
    await db!.user.update({ where: { id: stranger }, data: { role: "ADMIN" } });
    await prefs.moderate(stranger, report.id, { action: "hide", reason: "Спам" });
    expect((await social.listComments(owner, post.id)).items[0]).toMatchObject({ text: "", deleted: true });
    await expect(social.getComment(owner, comment.id)).rejects.toMatchObject({ status: 404 });
    await prefs.moderate(stranger, report.id, { action: "block", reason: "Повторный спам" });
    await expect(posts.create(reader, { clientRequestId: randomUUID() })).rejects.toMatchObject({ status: 403 });
    await expect(social.createComment(reader, post.id, { text: "Ещё", clientRequestId: randomUUID() })).rejects.toMatchObject({ status: 403 });
    await prefs.moderate(stranger, report.id, { action: "unblock", reason: "Ограничение снято" });
    await prefs.moderate(stranger, report.id, { action: "restore", reason: "Восстановлено" });
    expect((await social.getComment(owner, comment.id)).text).toBe("Спам в комментарии");
  });
  it("keeps author subscriptions push-only and does not push edits", async () => {
    const prefs = createFeedPreferences({ db: db!, enabled: () => true });
    await prefs.preference(reader, owner, { notify: true });
    const post = await publish();
    expect(await db!.feedNotification.count({ where: { postId: post.id, kind: "author_post" } })).toBe(1);
    expect((await social.listNotifications(reader)).items).toHaveLength(0);
    expect(await social.unreadCount(reader)).toEqual({ count: 0 });
    await posts.saveRevision(owner, post.id, { clientRequestId: randomUUID(), expectedVersion: 1, text: "Изменение", attachmentIds: [] });
    await posts.publish(owner, post.id, { clientRequestId: randomUUID() });
    expect(await db!.feedNotification.count({ where: { postId: post.id, kind: "author_post" } })).toBe(1);
  });
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
  it("resolves a notification comment only while its post and comment remain visible", async () => {
    const post = await publish();
    const comment = await social.createComment(reader, post.id, { clientRequestId: randomUUID(), text: "Из уведомления" });
    expect(await social.getComment(owner, comment.id)).toMatchObject({ id: comment.id, postId: post.id, text: "Из уведомления" });
    await social.deleteComment(reader, comment.id);
    await expect(social.getComment(owner, comment.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const other = await social.createComment(reader, post.id, { clientRequestId: randomUUID(), text: "Второй" });
    await posts.remove(owner, post.id);
    await expect(social.getComment(reader, other.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(social.getComment(randomUUID(), other.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
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
