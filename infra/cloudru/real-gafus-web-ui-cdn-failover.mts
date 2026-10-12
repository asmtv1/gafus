/** Real GAFUS Web CdnImage / FeedVideo Chrome failure injection with live isolated JWT API and S3. */
import puppeteer from "puppeteer";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { parse } from "dotenv";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
const env = {
  ...parse(await readFile(join(homedir(), ".codex/cloudru/storage-credentials.env"), "utf8")),
  ...process.env,
};
if (
  env.GAFUS_REAL_WEB_FAILOVER_CONFIRM !== "isolated-chrome-504-no-prod" ||
  env.CLOUDRU_S3_ENDPOINT !== "https://s3.cloud.ru"
)
  throw Error("WEB_STAGE_TEST_NOT_AUTHORIZED");
const stageDir = join(homedir(), ".codex/cloudru/gafus-media-core-staging");
const stage = Object.fromEntries(
  (await readFile(join(stageDir, "core.env"), "utf8"))
    .trim()
    .split("\n")
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1)];
    }),
);
process.env.DATABASE_URL =
  "postgresql://gafus_media_stage:" +
  stage.PG_APP_PASSWORD +
  "@127.0.0.1:55448/gafus_media_stage?schema=public";
process.env.REDIS_URL = "redis://:" + stage.REDIS_PASSWORD + "@127.0.0.1:56389";
process.env.JWT_SECRET = (await readFile(join(stageDir, "client-jwt-secret"), "utf8")).trim();
const require = createRequire(new URL("../../packages/prisma/package.json", import.meta.url));
const { PrismaClient } = require("@prisma/client");
const sharp = createRequire(new URL("../../apps/gallery-cloud/package.json", import.meta.url))(
  "sharp",
);
const { generateAccessToken } = await import("../../packages/auth/src/jwt.ts");
const s3 = new S3Client({
  endpoint: "https://s3.cloud.ru",
  region: "ru-central-1",
  forcePathStyle: true,
  maxAttempts: 3,
  credentials: {
    accessKeyId: env.CLOUDRU_S3_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDRU_S3_SECRET_ACCESS_KEY,
  },
});
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const owner = "stageui_" + randomUUID().replaceAll("-", "").slice(0, 22),
  bucket = "gafus-feed-private";
const entry = await readFile("/tmp/gafus-stage-fallback-real-web.js");
const sessionCookie = "stage_session_" + randomBytes(8).toString("hex");
const fixture = [],
  media = [],
  tempDir = await mkdtemp(join(tmpdir(), "gafus-web-ui-fallback-"));
let browser,
  createdUser = false,
  ok = true;
const assert = (x, msg) => {
  if (!x) throw Error("UI_TEST_" + msg);
};
const upload = async (key, data, mime) => {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: mime,
      IfNoneMatch: "*",
    }),
  );
  fixture.push(key);
};
async function createMedia(kind, files) {
  const post = "stagepost_" + randomUUID().replaceAll("-", "").slice(0, 20);
  const asset = "stagemedia_" + randomUUID().replaceAll("-", "").slice(0, 20);
  const revision = "stagerev_" + randomUUID().replaceAll("-", "").slice(0, 20);
  const prefix = "posts/" + owner + "/" + post + "/attachments/" + asset + "/";
  for (const { name, data, mime } of files) await upload(prefix + name, data, mime);
  await db.$transaction(async (tx) => {
    await tx.feedPost.create({
      data: {
        id: post,
        authorId: owner,
        status: "published",
        version: 1,
        clientRequestId: "ui-" + randomUUID(),
        activeRevisionId: revision,
        publishedAt: new Date(),
      },
    });
    await tx.feedPostRevision.create({
      data: {
        id: revision,
        postId: post,
        revisionNumber: 1,
        status: "ready",
        text: "Isolated UI E2E " + kind,
        clientRequestId: "ui-" + randomUUID(),
      },
    });
    await tx.feedMediaAsset.create({
      data: {
        id: asset,
        postId: post,
        ownerId: owner,
        status: "ready",
        kind,
        ...(kind === "photo"
          ? { fullKey: prefix + "full.webp", thumbKey: prefix + "thumb.webp" }
          : {
              posterKey: prefix + "poster.webp",
              playlistKey: prefix + "hls/playlist.m3u8",
              videoSegmentKeys: files
                .filter((f) => f.name.endsWith(".ts"))
                .map((f) => prefix + f.name),
            }),
      },
    });
    await tx.feedRevisionAttachment.create({
      data: { revisionId: revision, mediaId: asset, position: 0 },
    });
  });
  const item = { kind, post, asset, prefix };
  media.push(item);
  return item;
}
async function pageFor(mode, status, asset, cdnUrl, jwt) {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.setCookie({
    name: "gafus_stage_session",
    value: sessionCookie,
    domain: "gafus.ru",
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
  });
  const counts = {
    cdnImages: 0,
    cdnSegments: 0,
    probes: 0,
    fallBackApi: 0,
    fallbackManifest: 0,
    s3Images: 0,
    s3Segments: 0,
    wrongStageHost: 0,
  };
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push("JS " + error.message.slice(0, 220)));
  page.on("requestfailed", (request) =>
    consoleErrors.push(
      "REQUEST " + request.url().slice(0, 95) + " " + request.failure()?.errorText,
    ),
  );
  page.on("console", (m) => {
    if (m.type() === "error" && consoleErrors.length < 7)
      consoleErrors.push(m.text().slice(0, 190));
  });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    void (async () => {
      const url = new URL(request.url()),
        path = url.pathname,
        headers = request.headers();
      // MSE uses browser-local blob: URLs; these are NEVER remote prod traffic.
      if (["blob:", "data:", "about:"].includes(url.protocol)) return request.continue();
      const respond = (status, body = "", contentType = "text/plain") =>
        request.respond({ status, contentType, body, headers: { "Cache-Control": "no-store" } });
      // No actual www/production GAFUS HTTP requests from this browser:
      if (url.origin === "https://gafus.ru") {
        if (path === "/__gafus_fallback_stage__")
          return respond(
            200,
            '<!doctype html><html><head><meta charset="utf-8"><style>body{font:15px system-ui;color:#233;padding:28px}video{width:520px;height:300px;background:#111}img{display:block}</style></head><body><div id="root"></div><script>window.__STAGE_FIXTURE__=' +
              JSON.stringify({ mode, mediaId: asset, cdnUrl }) +
              ';</script><script src="/__gafus_fallback_bundle__.js"></script></body></html>',
            "text/html",
          );
        if (path === "/__gafus_fallback_bundle__.js")
          return respond(200, entry, "application/javascript");
        if (path === "/api/csrf-token")
          return respond(200, JSON.stringify({ token: "local-stage-token" }), "application/json");
        if (path === "/api/v1/media-cdn-probe") {
          counts.probes++;
          const target = new URL(url.searchParams.get("url") ?? "https://invalid.test/");
          const valid =
            target.host === "feed.gafus.ru" &&
            target.pathname.startsWith("/posts/") &&
            target.searchParams.has("md5") &&
            target.searchParams.has("expires");
          return respond(valid ? status : 400, "");
        }
        if (path.startsWith("/api/v1/feed/") || path.startsWith("/api/v1/feed-playback/")) {
          const authenticated = headers.cookie?.includes("gafus_stage_session=" + sessionCookie);
          if (!authenticated)
            return respond(401, '{"success":false,"code":"UNAUTHORIZED"}', "application/json");
          const playlist = path.startsWith("/api/v1/feed-playback/");
          if (!playlist) counts.fallBackApi++;
          if (playlist && url.searchParams.get("source") === "cloudru") counts.fallbackManifest++;
          if (
            !playlist &&
            request.method() !== "GET" &&
            headers["x-csrf-token"] !== "local-stage-token"
          )
            return respond(403, "");
          const upstream = await fetch("http://127.0.0.1:31341" + path + url.search, {
            method: request.method(),
            headers: {
              ...(!playlist ? { Authorization: "Bearer " + jwt } : {}),
              ...(headers["content-type"] ? { "Content-Type": headers["content-type"] } : {}),
            },
            body: ["POST", "PUT", "PATCH", "DELETE"].includes(request.method())
              ? request.postData()
              : undefined,
            signal: AbortSignal.timeout(10000),
          });
          const contentType = upstream.headers.get("content-type") ?? "text/plain";
          const payload = await upstream.text();
          return respond(upstream.status, payload, contentType);
        }
        counts.wrongStageHost++;
        consoleErrors.push("BAD_LOCAL_ROUTE " + path);
        return respond(404);
      }
      if (url.host === "feed.gafus.ru") {
        if (url.pathname.endsWith(".ts")) counts.cdnSegments++;
        else counts.cdnImages++;
        // Simulated Yandex CDN outage without contacting actual Yandex.
        return respond(status, "simulated CDN " + status);
      }
      if (url.host === "s3.cloud.ru") {
        if (url.pathname.endsWith(".ts")) counts.s3Segments++;
        else counts.s3Images++;
        return request.continue();
      }
      counts.wrongStageHost++;
      consoleErrors.push("BAD_FOREIGN_ROUTE " + url.hostname);
      return respond(403);
    })().catch((err) => {
      try {
        request.abort();
      } catch {}
      consoleErrors.push("interceptor " + err.message);
    });
  });
  await page.goto("https://gafus.ru/__gafus_fallback_stage__", {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  try {
    await page.waitForFunction(() => Boolean(window.__TEST_TRACKING__), { timeout: 11000 });
  } catch (failure) {
    const dom = await page.evaluate(() => ({
      url: location.href,
      body: document.body.innerText?.slice(0, 160),
      scriptCount: document.scripts.length,
      tracking: !!window.__TEST_TRACKING__,
    }));
    console.log(JSON.stringify({ browserAppBootFailure: true, consoleErrors, counts, dom }));
    throw failure;
  }
  return { page, counts, consoleErrors };
}
try {
  const health = await fetch("http://127.0.0.1:31341/__stage__/health", {
    signal: AbortSignal.timeout(8000),
  });
  assert(health.status === 200, "LOCAL_STAGE_API_NOT_READY");
  assert((await db.user.count()) === 0, "ISOLATED_DB_MUST_START_EMPTY");
  await db.user.create({
    data: {
      id: owner,
      username: owner,
      password: "unusable-ui-stage",
      registrationPending: false,
      passwordSetAt: new Date(),
    },
  });
  createdUser = true;
  const jwt = await generateAccessToken({ id: owner, username: owner, role: "USER" });
  const cover = await sharp({
    create: { width: 320, height: 180, channels: 3, background: { r: 56, g: 132, b: 75 } },
  })
    .webp()
    .toBuffer();
  const photo = await createMedia("photo", [
    { name: "full.webp", data: cover, mime: "image/webp" },
    { name: "thumb.webp", data: cover, mime: "image/webp" },
  ]);
  const hls = join(tempDir, "playlist.m3u8");
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=320x180:rate=24",
      "-t",
      "5",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "48",
      "-sc_threshold",
      "0",
      "-f",
      "hls",
      "-hls_time",
      "2",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      join(tempDir, "segment-%03d.ts"),
      hls,
    ],
    { timeout: 50000 },
  );
  const { readdir } = await import("node:fs/promises");
  const tsNames = (await readdir(tempDir)).filter((x) => /^segment-[0-9]{3}\.ts$/.test(x)).sort();
  assert(tsNames.length >= 1 && tsNames.length <= 5, "HLS_SEGMENTS_MISSING");
  const playlist = await readFile(hls);
  const vf = [
    { name: "poster.webp", data: cover, mime: "image/webp" },
    { name: "hls/playlist.m3u8", data: playlist, mime: "application/vnd.apple.mpegurl" },
  ];
  for (const name of tsNames)
    vf.push({ name: "hls/" + name, data: await readFile(join(tempDir, name)), mime: "video/mp2t" });
  const video = await createMedia("video", vf);
  const { signFeedCdnUrl } = await import("../../packages/feed-storage/src/storage.ts");
  const signer = JSON.parse(await readFile("infra/feed/.secrets/runtime.json", "utf8")).cdn_secret;
  const cdnUrl = signFeedCdnUrl(
    "https://feed.gafus.ru",
    photo.prefix + "full.webp",
    new Date(Date.now() + 115000),
    signer,
  );
  browser = await puppeteer.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  for (const status of process.env.GAFUS_TEST_VIDEO_ONLY === "true" ? [] : [504, 403, 404]) {
    const { page, counts, consoleErrors } = await pageFor(
      "image",
      status,
      photo.asset,
      cdnUrl,
      jwt,
    );
    if (status === 504) {
      await page.waitForFunction(
        () => {
          const im = document.querySelector("#stage-image");
          return im?.complete && im.naturalWidth > 0 && im.src.startsWith("https://s3.cloud.ru/");
        },
        { timeout: 33000 },
      );
      const result = await page.evaluate(() => ({
        src: document.querySelector("#stage-image")?.src,
        width: document.querySelector("#stage-image")?.naturalWidth,
        tracking: window.__TEST_TRACKING__,
      }));
      assert(
        result.width === 320 &&
          counts.probes >= 1 &&
          counts.fallBackApi >= 1 &&
          counts.s3Images >= 1,
        "WEB_IMAGE_504_FALLBACK",
      );
      console.log(
        JSON.stringify({
          component: "CdnImage",
          cdn: status,
          recovered: true,
          width: result.width,
          counts,
        }),
      );
    } else {
      await page.waitForFunction(() => window.__TEST_TRACKING__.imageErrors > 0, {
        timeout: 15000,
      });
      const tr = await page.evaluate(() => window.__TEST_TRACKING__);
      assert(
        tr.fallbackCalls === 0 &&
          counts.fallBackApi === 0 &&
          counts.s3Images === 0 &&
          counts.probes >= 1,
        "WEB_403_404_SECURITY",
      );
      console.log(
        JSON.stringify({
          component: "CdnImage",
          cdn: status,
          recovered: false,
          secureNoFallback: true,
          counts,
        }),
      );
    }
    await page.close();
  }
  for (const status of [504, 403, 404]) {
    const { page, counts, consoleErrors } = await pageFor("video", status, video.asset, "", jwt);
    await page.waitForSelector("button", { timeout: 15000 });
    await page.click("button");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const videoState = await page.evaluate(() => {
      const v = document.querySelector("video");
      return {
        hlsNative: v?.canPlayType("application/vnd.apple.mpegurl"),
        h264: v?.canPlayType("video/mp4;codecs=avc1.42E01E"),
        source: v?.currentSrc?.slice(0, 80),
        ready: v?.readyState,
        network: v?.networkState,
        error: v?.error?.code,
        componentError: document.querySelector('[role="alert"]')?.textContent,
      };
    });
    console.log(JSON.stringify({ videoStateAfterTwoSeconds: videoState, counts }));
    if (status === 504) {
      try {
        await page.waitForFunction(
          () => {
            const v = document.querySelector("video");
            return v?.currentTime > 0.15 && v.readyState >= 2;
          },
          { timeout: 55000, polling: 400 },
        );
      } catch (err) {
        console.log(
          JSON.stringify({
            videoWaitFailed: err.message,
            counts,
            consoleErrors,
            state: await page.evaluate(() => {
              let v = document.querySelector("video");
              return {
                time: v?.currentTime,
                ready: v?.readyState,
                error: document.querySelector('[role="alert"]')?.textContent,
              };
            }),
          }),
        );
        throw err;
      }
      assert(
        counts.cdnSegments >= 1 &&
          counts.probes >= 1 &&
          counts.fallbackManifest >= 1 &&
          counts.s3Segments >= 1,
        "WEB_VIDEO_FULL_AUTO_RECOVERY",
      );
      console.log(
        JSON.stringify({
          component: "FeedVideo",
          cdn: status,
          playingSeconds: await page.evaluate(() => document.querySelector("video").currentTime),
          counts,
        }),
      );
    } else {
      await page.waitForFunction(
        () => Boolean(document.querySelector('[role="alert"]')?.textContent),
        { timeout: 55000, polling: 500 },
      );
      assert(
        counts.fallbackManifest === 0 && counts.s3Segments === 0 && counts.probes >= 1,
        "WEB_VIDEO_403_404_NO_BYPASS",
      );
      console.log(
        JSON.stringify({
          component: "FeedVideo",
          cdn: status,
          secureNoFallback: true,
          counts,
          error: await page.evaluate(() => document.querySelector('[role="alert"]')?.textContent),
        }),
      );
    }
    await page.close();
  }
  console.log("ACTUAL_GAFUS_WEB_UI_CDN_FAILOVER_E2E=PASS");
} catch (error) {
  ok = false;
  console.log(JSON.stringify({ status: "WEB_UI_STAGE_FAIL", error: error.message.slice(0, 180) }));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (createdUser)
    try {
      await db.user.delete({ where: { id: owner } });
    } catch {
      ok = false;
      console.log("STAGING_USER_DELETE_FAILED");
    }
  let removed = 0;
  for (const key of fixture) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      } catch (ex) {
        if (ex.$metadata?.httpStatusCode === 404) removed++;
      }
    } catch {}
  }
  if (removed !== fixture.length) ok = false;
  const usersLeft = await db.user.count();
  if (usersLeft !== 0) ok = false;
  console.log(
    JSON.stringify({
      cleanup: {
        usersRemaining: usersLeft,
        s3Removed: removed,
        s3Created: fixture.length,
        passed: ok,
      },
    }),
  );
  s3.destroy();
  await db.$disconnect();
  await rm(tempDir, { recursive: true, force: true });
}
if (!ok) process.exitCode = 1;
