/** Real local Hono integration — historical keys -> CDN URLs, never production changes.
 * Run under the original restricted Refactor WORK PG and local Hono only.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { prisma } from "@gafus/prisma";
import { generateAccessToken } from "@gafus/auth/jwt";

const root = "/Users/asmtv1/Desktop/gafus-refactor";
const db = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
assert.equal(process.cwd(), `${root}/apps/api`);
assert.equal(execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"],
  { encoding: "utf8" }).trim(), root);
assert.equal(execFileSync("git", ["-C", root, "branch", "--show-current"],
  { encoding: "utf8" }).trim(), "vite");
assert.equal(db.hostname, "127.0.0.1");
assert.equal(db.port, "55921");
assert.equal(db.pathname, "/gafus_refactor_real_work_20261024");
assert.equal(db.username, "gafus_refactor_local_real");
assert.equal(db.search, "?schema=public");
assert.ok(db.password);
assert.equal(process.env.GAFUS_LOCAL_ISOLATED_API, "1");
assert.equal(process.env.GAFUS_LOCAL_READONLY_CDN, "enabled");
assert.ok((process.env.JWT_SECRET?.length ?? 0) >= 32);
const print = (name: string, result: string) => console.log(`LIVE_CDN_HTTP ${name} ${result}`);
const origin = "http://127.0.0.1:5173";
type Actor = { id: string; username: string; role: "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PARTNER" };
const access = async (actor: Actor) => `Bearer ${await generateAccessToken(actor)}`;
const req = async (path: string, jwt: string, method = "GET") => {
  const response = await fetch(`${origin}${path}`, {
    method, headers: { Authorization: jwt, ...(method !== "GET" ? { "Content-Type": "application/json" } : {}) },
    ...(method !== "GET" ? { body: "{}" } : {}), signal: AbortSignal.timeout(8000),
  });
  const data = await response.json().catch(() => null) as { success?: boolean; data?: unknown } | null;
  return { response, data: data?.data as Record<string, unknown> | undefined };
};
const urlChecks = (value: unknown, host: string) => {
  assert.equal(typeof value, "string");
  const parsed = new URL(value as string);
  assert.equal(parsed.protocol, "https:");
  assert.equal(parsed.hostname, host);
  assert.match(parsed.pathname, /^\/md5\([A-Za-z0-9_-]{22},\d{10}\)\//);
  assert.ok(!parsed.search);
  assert.ok(!parsed.pathname.includes("incoming"));
};
let checks = 0;
try {
  const photo = await prisma.galleryPhoto.findFirst({
    where: { status: "ready", deletedAt: null, owner: { registrationPending: false } },
    select: { id: true, albumId: true, owner: { select: { id: true, username: true, role: true } } },
  });
  assert.ok(photo, "GALLERY_READY_PHOTO_ABSENT");
  const photoJWT = await access(photo.owner);
  const g = await req(`/api/v1/gallery/photos/${photo.id}`, photoJWT);
  assert.equal(g.response.status, 200, "gallery GET");
  urlChecks(g.data?.thumbUrl, "fupiquafifeswu.begetcdn.cloud");
  urlChecks(g.data?.fullUrl, "fupiquafifeswu.begetcdn.cloud");
  checks++; print("GALLERY_FINAL_SIGNED_LINKS", "PASS");
  const cover = await req(`/api/v1/gallery/albums/${photo.albumId}`, photoJWT);
  assert.equal(cover.response.status, 200, "gallery album GET");
  checks++; print("GALLERY_ALBUM", "PASS");
  const forbiddenGallery = await req("/api/v1/gallery/albums", photoJWT, "POST");
  assert.equal(forbiddenGallery.response.status, 405, "gallery POST blocked");
  checks++; print("GALLERY_WRITE_GUARD", "PASS");
  const noAuth = await req(`/api/v1/gallery/photos/${photo.id}`, "");
  assert.equal(noAuth.response.status, 401, "anonymous forbidden");
  checks++; print("GALLERY_AUTH", "PASS");

  const feedPhoto = await prisma.feedMediaAsset.findFirst({
    where: { kind: "photo", status: "ready", post: { status: "published", deletedAt: null,
      moderationState: "visible", author: { registrationPending: false } } },
    select: { id: true, postId: true, post: { select: { author: { select: { id: true, username: true, role: true } } } } },
  });
  assert.ok(feedPhoto, "FEED_READY_PHOTO_ABSENT");
  const feedJWT = await access(feedPhoto.post.author);
  const feed = await req(`/api/v1/feed/posts/${feedPhoto.postId}`, feedJWT);
  assert.equal(feed.response.status, 200, "Feed post GET");
  const attachments = feed.data?.attachments as Array<Record<string, unknown>> | undefined;
  assert.ok(Array.isArray(attachments), "Feed attachments missing");
  const signed = attachments.find(x => x.id === feedPhoto.id);
  assert.ok(signed, "Active revision does not include sampled photo");
  urlChecks(signed.thumbUrl, "quepraquiecebquomiel.begetcdn.cloud");
  urlChecks(signed.fullUrl, "quepraquiecebquomiel.begetcdn.cloud");
  checks++; print("FEED_PHOTO_FINAL_SIGNED_LINKS", "PASS");
  const feedList = await req("/api/v1/feed/posts?pageSize=5", feedJWT);
  assert.equal(feedList.response.status, 200, "Feed list GET");
  checks++; print("FEED_LIST", "PASS");
  const forbiddenFeed = await req("/api/v1/feed/posts", feedJWT, "POST");
  assert.equal(forbiddenFeed.response.status, 405, "Feed write guard");
  checks++; print("FEED_WRITE_GUARD", "PASS");

  const video = await prisma.feedMediaAsset.findFirst({
    where: { kind: "video", status: "ready", playlistKey: { not: null },
      post: { status: "published", deletedAt: null, moderationState: "visible",
        author: { registrationPending: false } } },
    select: { id: true, postId: true, post: { select: { author: { select: { id: true, username: true, role: true } } } } },
  });
  assert.ok(video, "FEED_READY_VIDEO_ABSENT");
  const vJWT = await access(video.post.author);
  const videoPost = await req(`/api/v1/feed/posts/${video.postId}`, vJWT);
  assert.equal(videoPost.response.status, 200, "Video post GET");
  const videoAttachments = videoPost.data?.attachments as Array<Record<string, unknown>> | undefined;
  assert.ok(Array.isArray(videoAttachments));
  const playable = videoAttachments.find(x => x.id === video.id);
  assert.ok(playable, "Active revision does not include sampled video");
  urlChecks(playable.posterUrl, "quepraquiecebquomiel.begetcdn.cloud");
  checks++; print("HLS_POSTER_SIGNED_LINK", "PASS");
  const ticket = await req(`/api/v1/feed/media/${video.id}/playback`, vJWT, "POST");
  assert.equal(ticket.response.status, 200, "read-only playback ticket POST");
  assert.equal(typeof ticket.data?.manifestUrl, "string");
  assert.ok((ticket.data!.manifestUrl as string).startsWith(`/api/v1/feed-playback/${video.id}?ticket=`));
  checks++; print("HLS_PLAYBACK_READONLY_TICKET", "PASS");
  print("SUMMARY", `${checks} PASS`);
} finally { await prisma.$disconnect(); }
