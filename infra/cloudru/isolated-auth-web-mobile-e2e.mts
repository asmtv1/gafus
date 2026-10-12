/** Real authenticated GAFUS Feed Web/Mobile HTTP transport E2E on localhost only. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import puppeteer from "puppeteer";
import { parse } from "dotenv";
const e = {
  ...parse(await readFile(join(homedir(), ".codex/cloudru/storage-credentials.env"), "utf8")),
  ...process.env,
};
if (
  e.GAFUS_AUTH_E2E_CONFIRM !== "isolated-users-and-disposable-s3" ||
  e.CLOUDRU_S3_ENDPOINT !== "https://s3.cloud.ru" ||
  !e.CLOUDRU_S3_ACCESS_KEY_ID ||
  !e.CLOUDRU_S3_SECRET_ACCESS_KEY
)
  throw Error("AUTH_E2E_NOT_AUTHORIZED");
const root = join(homedir(), ".codex/cloudru/gafus-media-core-staging");
const vals = Object.fromEntries(
  (await readFile(join(root, "core.env"), "utf8"))
    .trim()
    .split("\n")
    .map((s) => {
      const i = s.indexOf("=");
      return [s.slice(0, i), s.slice(i + 1)];
    }),
);
const jwt = (await readFile(join(root, "client-jwt-secret"), "utf8")).trim();
process.env.JWT_SECRET = jwt;
process.env.DATABASE_URL =
  "postgresql://gafus_media_stage:" +
  vals.PG_APP_PASSWORD +
  "@127.0.0.1:55448/gafus_media_stage?schema=public";
process.env.REDIS_URL = "redis://:" + vals.REDIS_PASSWORD + "@127.0.0.1:56389";
const require = createRequire(new URL("../../packages/prisma/package.json", import.meta.url));
const { PrismaClient } = require("@prisma/client");
const sharp = createRequire(new URL("../../apps/gallery-cloud/package.json", import.meta.url))(
  "sharp",
);
const { generateAccessToken } = await import("../../packages/auth/src/jwt.ts");
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const s3 = new S3Client({
  endpoint: "https://s3.cloud.ru",
  region: "ru-central-1",
  forcePathStyle: true,
  maxAttempts: 1,
  credentials: {
    accessKeyId: e.CLOUDRU_S3_ACCESS_KEY_ID,
    secretAccessKey: e.CLOUDRU_S3_SECRET_ACCESS_KEY,
  },
});
const bucket = "gafus-feed-private",
  base = "http://127.0.0.1:31341",
  suffix = randomUUID().replaceAll("-", "");
const owner = "stageauth_" + suffix.slice(0, 20),
  other = "stageother_" + suffix.slice(0, 20);
const fileEntries = [],
  actorIds = [];
let browser;
let success = true;
const assert = (b, tag) => {
  if (!b) throw Error("AUTH_E2E_" + tag);
};
async function api(route, { method = "GET", token, body } = {}) {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const text = await response.text();
  return {
    status: response.status,
    json: (() => {
      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    })(),
  };
}
async function save(key, bytes, mime) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: mime,
      IfNoneMatch: "*",
    }),
  );
  fileEntries.push(key);
}
try {
  const health = await api("/__stage__/health");
  assert(
    health.status === 200 && health.json.environment === "isolated-client-staging",
    "STAGE_HEALTH",
  );
  assert((await db.user.count()) === 0, "STAGE_DATABASE_NOT_EMPTY");
  for (const id of [owner, other]) {
    await db.user.create({
      data: {
        id,
        username: id,
        password: "unusable-staging",
        passwordSetAt: new Date(),
        registrationPending: false,
      },
    });
    actorIds.push(id);
  }
  const actor = await generateAccessToken({ id: owner, username: owner, role: "USER" });
  const stranger = await generateAccessToken({ id: other, username: other, role: "USER" });
  const cover = await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 65, g: 138, b: 67 } },
  })
    .webp()
    .toBuffer();
  const segment = Buffer.alloc(376, 0x47);
  const resources = [];
  for (const kind of ["photo", "video"]) {
    const post = "stagepost_" + randomUUID().replaceAll("-", "").slice(0, 20);
    const media = "stagemedia_" + randomUUID().replaceAll("-", "").slice(0, 20);
    const revision = "stagerev_" + randomUUID().replaceAll("-", "").slice(0, 20);
    const prefix = "posts/" + owner + "/" + post + "/attachments/" + media + "/";
    const files =
      kind === "photo"
        ? [
            { key: prefix + "full.webp", bytes: cover, mime: "image/webp" },
            { key: prefix + "thumb.webp", bytes: cover, mime: "image/webp" },
          ]
        : [
            { key: prefix + "poster.webp", bytes: cover, mime: "image/webp" },
            {
              key: prefix + "hls/playlist.m3u8",
              bytes: Buffer.from(
                "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.0,\nsegment-000.ts\n#EXT-X-ENDLIST\n",
              ),
              mime: "application/vnd.apple.mpegurl",
            },
            { key: prefix + "hls/segment-000.ts", bytes: segment, mime: "video/mp2t" },
          ];
    for (const file of files) await save(file.key, file.bytes, file.mime);
    await db.$transaction(async (tx) => {
      await tx.feedPost.create({
        data: {
          id: post,
          authorId: owner,
          status: "published",
          version: 1,
          clientRequestId: "stage-" + randomUUID(),
          activeRevisionId: revision,
          publishedAt: new Date(),
        },
      });
      await tx.feedPostRevision.create({
        data: {
          id: revision,
          postId: post,
          status: "ready",
          revisionNumber: 1,
          text: "Synthetic staging " + kind,
          clientRequestId: "stage-" + randomUUID(),
        },
      });
      await tx.feedMediaAsset.create({
        data: {
          id: media,
          postId: post,
          ownerId: owner,
          kind,
          status: "ready",
          ...(kind === "photo"
            ? { fullKey: prefix + "full.webp", thumbKey: prefix + "thumb.webp" }
            : {
                posterKey: prefix + "poster.webp",
                playlistKey: prefix + "hls/playlist.m3u8",
                videoSegmentKeys: [prefix + "hls/segment-000.ts"],
              }),
        },
      });
      await tx.feedRevisionAttachment.create({
        data: { revisionId: revision, mediaId: media, position: 0 },
      });
    });
    resources.push({ post, media, revision, kind, prefix });
  }
  const photo = resources.find((x) => x.kind === "photo"),
    video = resources.find((x) => x.kind === "video");
  const unauthorized = await api("/api/v1/feed/media/" + photo.media + "/fallback", {
    method: "POST",
    body: { variant: "full" },
  });
  const invalid = await api("/api/v1/feed/media/" + photo.media + "/fallback", {
    method: "POST",
    token: "nope",
    body: { variant: "full" },
  });
  const invalidVariant = await api("/api/v1/feed/media/" + photo.media + "/fallback", {
    method: "POST",
    token: actor,
    body: { variant: "source" },
  });
  const fb = await api("/api/v1/feed/media/" + photo.media + "/fallback", {
    method: "POST",
    token: actor,
    body: { variant: "full" },
  });
  assert(
    unauthorized.status === 401 && invalid.status === 401 && invalidVariant.status === 400,
    "AUTHENTICATION_OR_VALIDATION",
  );
  assert(
    fb.status === 200 && fb.json.data?.url?.startsWith("https://s3.cloud.ru/"),
    "AUTHORIZED_FALLBACK",
  );
  const s3get = await fetch(fb.json.data.url, { signal: AbortSignal.timeout(15000) });
  assert(
    s3get.status === 200 && Buffer.from(await s3get.arrayBuffer()).equals(cover),
    "SIGNED_PHOTO_BYTES",
  );
  console.log(
    JSON.stringify({
      channel: "mobile-bearer",
      unauthenticated: unauthorized.status,
      invalidToken: invalid.status,
      badVariant: invalidVariant.status,
      authorizedFallback: fb.status,
      cloudruSignedGet: true,
    }),
  );
  const playback = await api("/api/v1/feed/media/" + video.media + "/playback", {
    method: "POST",
    token: actor,
    body: {},
  });
  assert(playback.status === 200 && playback.json.data?.manifestUrl, "PLAYBACK_TICKET");
  const normal = await api(playback.json.data.manifestUrl);
  const direct = await api(playback.json.data.manifestUrl + "&source=cloudru");
  assert(normal.status === 200 && normal.json.text?.includes("feed.gafus.ru"), "CDN_MANIFEST");
  assert(direct.status === 200 && direct.json.text?.includes("s3.cloud.ru"), "CLOUDRU_MANIFEST");
  const lines = direct.json.text.split(/\r?\n/).filter((x) => x && !x.startsWith("#"));
  assert(lines.length === 1, "SEGMENT_COUNT");
  const seg = await fetch(lines[0], { signal: AbortSignal.timeout(12000) });
  assert(
    seg.status === 200 && Buffer.from(await seg.arrayBuffer()).equals(segment),
    "SIGNED_SEGMENT_BYTES",
  );
  const tampered = await api(
    playback.json.data.manifestUrl.replace(/ticket=[^&]+/, "ticket=invalid"),
  );
  assert(tampered.status === 404, "PLAYBACK_TICKET_TAMPERING");
  const outside = await api("/api/v1/feed/media/" + video.media + "/playback", {
    method: "POST",
    body: {},
  });
  assert(outside.status === 401, "PLAYBACK_REQUIRES_JWT");
  console.log(
    JSON.stringify({
      channel: "mobile-hls",
      playback: playback.status,
      cdnManifest: normal.status,
      fallbackManifest: direct.status,
      segments: lines.length,
      segmentBytes: true,
      tamperedTicket: tampered.status,
    }),
  );
  browser = await puppeteer.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  const page = await browser.newPage();
  await page.goto(base + "/__stage__/health", { waitUntil: "domcontentloaded", timeout: 15000 });
  // Puppeteer serializes this plain JS expression without tsx's __name helper.
  // Cross-origin S3 images are loadable as <img> without requiring a CORS fetch.
  const browserInput = { route: "/api/v1/feed/media/" + photo.media + "/fallback", token: actor };
  const script = `(async () => {
    const input = ${JSON.stringify(browserInput)};
    async function go(t) {
      const r = await fetch(input.route, {method:"POST",
        headers: {"Content-Type":"application/json", ...(t ? {Authorization:"Bearer "+t} : {})},
        body:JSON.stringify({variant:"full"})});
      return {status:r.status, body:await r.json()};
    }
    const denied=await go(null),accepted=await go(input.token);
    let imageLoaded=false;
    if(accepted.body?.data?.url) {
      imageLoaded=await new Promise(resolve=>{
        const image=new Image();
        image.onload=()=>resolve(true);
        image.onerror=()=>resolve(false);
        image.src=accepted.body.data.url;
      });
    }
    return {unauthenticated:denied.status,authorized:accepted.status,imageLoaded};
  })()`;
  const web = await page.evaluate(script);
  assert(
    web.unauthenticated === 401 && web.authorized === 200 && web.imageLoaded === true,
    "CHROME_AUTHENTICATED_FALLBACK",
  );
  console.log(JSON.stringify({ channel: "web-chrome", ...web }));
  await db.feedPost.update({ where: { id: photo.post }, data: { deletedAt: new Date() } });
  const revoked = await api("/api/v1/feed/media/" + photo.media + "/fallback", {
    method: "POST",
    token: stranger,
    body: { variant: "full" },
  });
  assert(revoked.status === 404, "REMOVED_MEDIA_REVOCATION");
  const previously = await api("/api/v1/feed/media/" + video.media + "/playback", {
    method: "POST",
    token: stranger,
    body: {},
  });
  assert(previously.status === 200, "PUBLIC_MEDIA_VISIBILITY");
  await db.feedPost.update({ where: { id: video.post }, data: { deletedAt: new Date() } });
  const revokedHls = await api(playback.json.data.manifestUrl + "&source=cloudru");
  assert(revokedHls.status === 404, "DELETED_POST_MANIFEST_REVOCATION");
  console.log(
    JSON.stringify({
      channel: "access-controls",
      removedPhotoDenied: revoked.status,
      publicMediaAccess: previously.status,
      revokedManifest: revokedHls.status,
    }),
  );
  console.log("ISOLATED_AUTH_WEB_MOBILE_HTTP_ACCEPTANCE=PASS");
} catch (ex) {
  console.log(
    JSON.stringify({ isolatedClientE2E: "FAIL", code: ex?.message?.slice(0, 100) ?? "unknown" }),
  );
  success = false;
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const id of actorIds) {
    try {
      await db.user.delete({ where: { id } });
    } catch (ex) {
      console.log(JSON.stringify({ syntheticUserCleanupFailed: true }));
      success = false;
    }
  }
  let removedCount = 0;
  for (const key of fileEntries) {
    let removed = false;
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      } catch (ex) {
        removed = ex?.$metadata?.httpStatusCode === 404;
      }
    } catch {}
    if (!removed) success = false;
    else removedCount++;
  }
  console.log(
    JSON.stringify({
      stagingUsersRemoved: (await db.user.count()) === 0,
      syntheticS3Removed: removedCount === fileEntries.length,
      fileCount: fileEntries.length,
    }),
  );
  await db.$disconnect();
  s3.destroy();
}
if (!success) process.exitCode = 1;
