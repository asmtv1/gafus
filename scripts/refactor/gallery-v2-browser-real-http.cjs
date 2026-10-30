"use strict";
/**
 * Actual Chrome -> Vite -> real local Hono Auth/Gallery -> dedicated PG/S3
 * full synthetic owner flow. No API route interception. External requests
 * denied. Cleanup touches only the generated owner and owned storage keys.
 */
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");
const { randomUUID, randomBytes } = require("node:crypto");
const puppeteer = require("puppeteer");
const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const DB = "postgresql://asmtv1@127.0.0.1:5432/gafus_gallery_v2_test_20261028";
if (fs.realpathSync(process.cwd()) !== ROOT) throw Error("GALLERY_BROWSER_ROOT_DENIED");
const prismaRequire = createRequire(path.join(ROOT, "packages/prisma/package.json"));
const apiRequire = createRequire(path.join(ROOT, "apps/api/package.json"));
const cloudRequire = createRequire(path.join(ROOT, "apps/gallery-cloud/package.json"));
const { PrismaClient } = prismaRequire("@prisma/client");
const bcrypt = apiRequire("bcryptjs");
const sharp = cloudRequire("sharp");
const { S3Client, DeleteObjectCommand, HeadObjectCommand } = cloudRequire("@aws-sdk/client-s3");
const credsFile = path.join(ROOT, ".local-pg-scratch/nonprod-s3/credentials.json");
const credsInfo = fs.lstatSync(credsFile);
if (!credsInfo.isFile() || credsInfo.isSymbolicLink() || (credsInfo.mode & 0o777) !== 0o600)
  throw Error("GALLERY_BROWSER_LOCAL_CREDENTIALS_DENIED");
const creds = JSON.parse(fs.readFileSync(credsFile, "utf8"));
const bucket = "gafus-refactor-gallery-test";
const s3 = new S3Client({
  endpoint: "http://127.0.0.1:9000", region: "us-east-1", forcePathStyle: true,
  credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  maxAttempts: 1,
});
const db = new PrismaClient({ datasources: { db: { url: DB } } });
const ownerName = "galleryv2browser_" + randomBytes(7).toString("hex");
const password = "BrowserV2_" + randomBytes(18).toString("base64url");
let owner, albumId, browser, page, phase = "preflight";
const scratch = path.join(ROOT, ".local-pg-scratch/gallery-v2-browser-smoke");
const requestStatuses = [];
function assert(ok, code) { if (!ok) throw Error("GALLERY_V2_BROWSER_" + code); }
async function waitFor(predicate, timeout = 16000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await predicate();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error("GALLERY_V2_BROWSER_TIMEOUT_" + phase);
}
function report(key, value) { console.log("GALLERY_REAL_HTTP_" + key + "=" + value); }
async function cleanOwner() {
  if (!owner) return;
  const uploads = await db.galleryUpload.findMany({ where: { ownerId: owner.id } });
  const photos = await db.galleryPhoto.findMany({ where: { ownerId: owner.id } });
  const keys = [...new Set([
    ...uploads.flatMap(u => [u.sourceKey, u.stagedThumbKey, u.stagedFullKey]),
    ...photos.flatMap(p => [p.thumbKey, p.fullKey]),
  ].filter(Boolean))];
  for (const key of keys) {
    if (!key.includes(owner.id + "/") &&
      !key.startsWith("gallery/" + owner.id + "/")) throw Error("UNEXPECTED_CLEANUP_KEY");
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      throw Error("S3_OBJECT_REMAINED_AFTER_DELETE");
    } catch (e) {
      if (e.message === "S3_OBJECT_REMAINED_AFTER_DELETE") throw e;
      if (e.$metadata?.httpStatusCode !== 404) throw e;
    }
  }
  await db.galleryStorageJob.deleteMany({ where: { ownerId: owner.id } });
  await db.user.delete({ where: { id: owner.id } });
  report("OWNED_ROWS_AND_OBJECTS_CLEANED", "PASS");
}
(async () => {
  try {
    assert((await db.user.count()) === 0, "DEDICATED_DB_NOT_EMPTY");
    const health = await fetch("http://127.0.0.1:3601/__gallery_v2_test_health");
    assert(health.ok && (await health.json()).environment === "dedicated-gallery-v2-local",
      "API_NOT_ISOLATED");
    owner = await db.user.create({ data: {
      username: ownerName, password: await bcrypt.hash(password, 10),
      role: "USER", passwordSetAt: new Date(), registrationPending: false,
    } });
    phase = "browser_start";
    fs.mkdirSync(scratch, { recursive: true });
    browser = await puppeteer.launch({
      executablePath: path.join(ROOT, ".local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell"),
      headless: true, userDataDir: path.join(scratch, "chrome-real-api-profile"),
      args: ["--no-first-run", "--no-default-browser-check"],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on("request", req => {
      const u = new URL(req.url());
      if (["localhost", "127.0.0.1"].includes(u.hostname) ||
        ["data:", "blob:", "about:"].includes(u.protocol)) req.continue();
      else req.abort("blockedbyclient");
    });
    page.on("response", response => {
      const u = new URL(response.url());
      if (u.pathname.startsWith("/api/v1/"))
        requestStatuses.push([u.pathname, response.status()]);
    });
    const jsErrors = [];
    page.on("pageerror", err => jsErrors.push(err.message));
    phase = "login";
    await page.goto("http://127.0.0.1:5173/login", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#login-name");
    await page.type("#login-name", ownerName);
    await page.type("#login-password", password);
    await page.click("button[type=submit][aria-label='Войти']");
    await waitFor(async () => (await page.evaluate(() => document.body.innerText))
      .includes("Пользователь: " + ownerName), 12000);
    report("REAL_COOKIE_LOGIN", "PASS");
    phase = "gallery_desktop";
    await page.goto("http://127.0.0.1:5173/profile/albums", {
      waitUntil: "domcontentloaded",
    });
    await waitFor(async () => await page.$('section[data-next-gallery]'));
    const reject = await page.$("[data-next-cookie-consent] button");
    if (reject) {
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll("[data-next-cookie-consent] button")];
        buttons.find(b => b.textContent?.trim() === "Отклонить")?.click();
      });
    }
    await waitFor(async () => (await page.evaluate(() =>
      document.querySelector("section[data-next-gallery]")?.innerText ?? "")).includes("Фотоальбомы"));
    await waitFor(async () => (await page.evaluate(() =>
      [...document.querySelectorAll("button")].some(b => b.textContent?.includes("Создать альбом")))));
    report("DESKTOP_GALLERY_OWNER_AUTHORIZED", "PASS");
    // The first login asynchronously mounts a 9-step tour overlay that
    // intercepts album buttons. Dismiss it with the real UI before writes;
    // the tour intentionally redirects to /profile, so reopen the gallery.
    const tourButton = await page.waitForSelector("[data-web1-tour-secondary]", {
      timeout: 6000, visible: true,
    }).catch(() => null);
    if (tourButton) {
      await tourButton.click();
      await waitFor(async () => !(await page.$("[data-web1-tour-secondary]")), 10000);
      await page.goto("http://127.0.0.1:5173/profile/albums", {
        waitUntil: "domcontentloaded",
      });
      await waitFor(async () => await page.$("section[data-next-gallery]"));
      report("FIRST_VISIT_TOUR_SKIPPED", "PASS");
    }
    phase = "create_album";
    // A direct DOM click can race React's post-tour remount. Use Chrome's
    // real pointer click after the active button has mounted and settled.
    await waitFor(async () => (await page.evaluate(() => {
      const button = [...document.querySelectorAll("section[data-next-gallery] button")]
        .find(b => b.textContent?.includes("Создать альбом"));
      return Boolean(button && !button.disabled && button.getClientRects().length);
    })), 12000);
    await new Promise(resolve => setTimeout(resolve, 400));
    let opened = false;
    for (let attempt = 0; attempt < 2 && !opened; attempt++) {
      const candidates = await page.$$("section[data-next-gallery] button");
      for (const candidate of candidates) {
        const isCreate = await candidate.evaluate(el =>
          el.textContent?.includes("Создать альбом") === true);
        if (isCreate) { await candidate.click(); break; }
      }
      opened = await page.waitForSelector("form.gallery-editor input[required]", {
        timeout: 4000,
      }).catch(() => null);
    }
    assert(Boolean(opened), "CREATE_ALBUM_FORM_NOT_OPENED");
    await page.type("form.gallery-editor input[required]", "Реальный E2E V2");
    await page.click("form.gallery-editor button[type=submit]");
    albumId = await waitFor(async () => {
      const albums = await db.galleryAlbum.findMany({
        where: { ownerId: owner.id },
      });
      return albums.length === 1 ? albums[0].id : undefined;
    });
    await waitFor(() => page.url().includes("/profile/albums/" + albumId));
    report("BROWSER_CREATE_ALBUM_REAL_SQL", "PASS");
    phase = "mobile_gallery";
    await page.setViewport({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitFor(async () =>
      (await page.evaluate(() => document.body.innerText)).includes("Реальный E2E V2"));
    // Album detail and photo list load separately after session revalidation.
    await waitFor(async () => await page.evaluate(() =>
      [...document.querySelectorAll("button")].some(button =>
        button.textContent?.includes("Добавить фотографии") && !button.disabled)), 20000);
    const screen = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, viewport: innerWidth,
      hasUploader: Boolean([...document.querySelectorAll("button")].find(b =>
        b.textContent?.includes("Добавить фотографии"))),
    }));
    assert(screen.width <= screen.viewport + 1 && screen.hasUploader,
      "MOBILE_LAYOUT_OR_UPLOAD_MISSING");
    report("MOBILE_REAL_AUTH_ALBUM_AND_UPLOADER", "PASS");
    phase = "browser_upload";
    const img = await sharp({
      create: { width: 1080, height: 720, channels: 3, background: "#417b6a" },
    }).jpeg({ quality: 86 }).toBuffer();
    const photoPath = path.join(scratch, "real-api-photo.jpg");
    fs.writeFileSync(photoPath, img);
    const input = await page.$("section[data-next-gallery] input[type=file]");
    assert(Boolean(input), "UPLOAD_INPUT_NOT_MOUNTED");
    await input.uploadFile(photoPath);
    // Wait for REAL Hono->PG to commit a reservation/confirmation.
    const upload = await waitFor(async () => {
      const rows = await db.galleryUpload.findMany({ where: { ownerId: owner.id } });
      return rows.length ? rows[0] : undefined;
    });
    report("MOBILE_BROWSER_REAL_UPLOAD_RESERVATION", "PASS");
    const confirmed = await waitFor(async () => {
      const current = await db.galleryUpload.findUnique({ where: { id: upload.id } });
      return current?.status === "uploaded" ? current : undefined;
    }, 18000).catch(() => undefined);
    if (confirmed) report("MOBILE_BROWSER_S3_AND_CONFIRM", "PASS");
    else {
      const state = await db.galleryUpload.findUnique({ where: { id: upload.id } });
      const diagnostics = (await page.evaluate(() => document.body.innerText)).slice(-530);
      console.log("GALLERY_REAL_HTTP_UPLOAD_PROBLEM=" + JSON.stringify({
        stage: state?.status, ui: diagnostics, requests: requestStatuses.slice(-8),
      }));
      throw Error("GALLERY_REAL_HTTP_UPLOAD_NOT_CONFIRMED");
    }
    phase = "real_sharp_worker";
    const workerReport = execFileSync("/opt/homebrew/bin/pnpm", [
      "--filter", "@gafus/api", "exec", "tsx",
      "../gallery-cloud/src/gallery-v2-browser-worker-once.ts",
    ], {
      cwd: ROOT, timeout: 70000, encoding: "utf8",
      env: {
        PATH: "/opt/homebrew/bin:/usr/bin:/bin",
        HOME: path.join(ROOT, ".local-pg-scratch"),
        NODE_ENV: "development", DATABASE_URL: DB,
        GAFUS_LOCAL_ISOLATED_API: "1", GAFUS_ISOLATED_NONPROD_S3: "enabled",
        GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
        GAFUS_ISOLATED_S3_GALLERY_BUCKET: bucket, GALLERY_ENABLED: "true",
        GALLERY_V2_BROWSER_OWNER_ID: owner.id,
        GALLERY_V2_BROWSER_UPLOAD_ID: confirmed.id,
      },
    });
    assert(workerReport.includes("GALLERY_REAL_HTTP_SHARP_WORKER_ATOMIC_READY=PASS"),
      "SHARP_WORKER_UNCONFIRMED");
    report("REAL_SHARP_WORKER_ATOMIC_READY", "PASS");
    phase = "mobile_ready_webp_viewer";
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await waitFor(async () => await page.evaluate(() => {
      const button = document.querySelector(
        'button[aria-label^="Открыть фотографию"]');
      const img = button?.querySelector("img");
      return Boolean(img && img.complete && img.naturalWidth > 0);
    }), 25000);
    const imageButton = await page.$('button[aria-label^="Открыть фотографию"]');
    assert(Boolean(imageButton), "READY_THUMBNAIL_MISSING");
    await imageButton.click();
    await page.waitForSelector('[role="dialog"][aria-label="Просмотр фотографии"]', {
      timeout: 12000,
    });
    report("MOBILE_BROWSER_READY_WEBP_AND_VIEWER", "PASS");
    phase = "browser_photo_delete";
    const closeViewer = await page.$(
      '[role="dialog"][aria-label="Просмотр фотографии"] button');
    assert(Boolean(closeViewer), "VIEWER_CLOSE_CONTROL_MISSING");
    await closeViewer.click();
    await waitFor(async () => !(await page.$(
      '[role="dialog"][aria-label="Просмотр фотографии"]')), 8000);
    const managePhoto = await page.$('button[aria-label^="Управление фотографией:"]');
    assert(Boolean(managePhoto), "MANAGE_PHOTO_CONTROL_MISSING");
    await managePhoto.click();
    await page.waitForSelector('[role="dialog"][aria-label="Фотография"]', {
      timeout: 8000,
    });
    const clickDialogButton = async text => {
      const matches = await page.$$('[role="dialog"][aria-label="Фотография"] button');
      for (const match of matches) {
        const isTarget = await match.evaluate((el, expected) =>
          el.textContent?.trim() === expected, text);
        if (isTarget) { await match.click(); return; }
      }
      throw Error("GALLERY_DIALOG_BUTTON_NOT_FOUND_" + text);
    };
    await clickDialogButton("Удалить фото");
    await clickDialogButton("Да, удалить фото");
    await waitFor(async () => {
      const photo = await db.galleryPhoto.findUnique({
        where: { id: confirmed.photoId },
      });
      return Boolean(photo?.deletedAt);
    }, 18000);
    report("MOBILE_BROWSER_PHOTO_DELETE_REAL_HONO", "PASS");
    const cleanupWorker = execFileSync("/opt/homebrew/bin/pnpm", [
      "--filter", "@gafus/api", "exec", "tsx",
      "../gallery-cloud/src/gallery-v2-browser-worker-once.ts",
    ], {
      cwd: ROOT, timeout: 70000, encoding: "utf8",
      env: {
        PATH: "/opt/homebrew/bin:/usr/bin:/bin",
        HOME: path.join(ROOT, ".local-pg-scratch"),
        NODE_ENV: "development", DATABASE_URL: DB,
        GAFUS_LOCAL_ISOLATED_API: "1", GAFUS_ISOLATED_NONPROD_S3: "enabled",
        GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
        GAFUS_ISOLATED_S3_GALLERY_BUCKET: bucket, GALLERY_ENABLED: "true",
        GALLERY_V2_BROWSER_OWNER_ID: owner.id,
        GALLERY_V2_BROWSER_UPLOAD_ID: confirmed.id,
        GALLERY_V2_BROWSER_WORKER_ACTION: "delete",
      },
    });
    assert(cleanupWorker.includes("GALLERY_REAL_HTTP_DURABLE_S3_DELETE=PASS"),
      "DURABLE_S3_DELETE_NOT_CONFIRMED");
    report("REAL_S3_WEBP_DELETE_AFTER_BROWSER_REMOVAL", "PASS");
    assert(jsErrors.length === 0, "JAVASCRIPT_ERRORS");
    report("BROWSER_JS_ERRORS", 0);
  } catch (e) {
    process.exitCode = 1;
    console.error("GALLERY_REAL_HTTP_FAILED_PHASE=" + phase + " code=" + String(e.message).slice(0, 160));
    if (page) {
      try {
        console.error("GALLERY_REAL_HTTP_VISIBLE=" +
          (await page.evaluate(() => document.body.innerText)).slice(-600));
        console.error("GALLERY_REAL_HTTP_REQUESTS=" + JSON.stringify(requestStatuses.slice(-14)));
      } catch {}
    }
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
    try { await cleanOwner(); }
    catch (e) {
      console.error("GALLERY_REAL_HTTP_CLEANUP_FAILED=" + String(e.message).slice(0, 120));
      process.exitCode = 1;
    }
    await db.$disconnect();
    s3.destroy();
    fs.rmSync(path.join(scratch, "chrome-real-api-profile"), { recursive: true, force: true });
    fs.rmSync(path.join(scratch, "real-api-photo.jpg"), { force: true });
    process.exit(process.exitCode ?? 0); // after ALL resource cleanup; Redis may hold SDK handles
  }
})().catch(e => {
  console.error("GALLERY_REAL_HTTP_FATAL=" + String(e.message).slice(0, 140));
  process.exitCode = 1;
});
