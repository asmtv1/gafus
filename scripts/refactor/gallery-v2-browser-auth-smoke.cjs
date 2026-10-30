"use strict";
/**
 * Live Chrome rendering of the actual Vite application entrypoint, with
 * intercepted same-origin synthetic API responses. Never contacts production
 * or writes real application data. No persisted browser credentials.
 */
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");
const sharp = require("../../apps/gallery-cloud/node_modules/sharp");
const root = "/Users/asmtv1/Desktop/gafus-refactor";
if (fs.realpathSync(process.cwd()) !== root) throw Error("OUTSIDE_GAFUS_REFACTOR");
const origin = "http://127.0.0.1:5173";
const scratch = path.join(root, ".local-pg-scratch/gallery-v2-browser-smoke");
fs.mkdirSync(scratch, { recursive: true });
const user = { id: "gallery-browser-user", username: "gallerybrowser", role: "USER" };
const albumId = "gallery-browser-album";
const expiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
const album = {
  id: albumId, ownerId: user.id, ownerUsername: user.username,
  name: "Тестовый альбом V2", description: null, isVisible: false,
  canEdit: true, photoCount: 1, coverThumbUrl: "https://gallery-v2-fixture.invalid/thumb.webp",
  coverPhotoId: null, urlsExpireAt: expiry,
};
const photoId = "gallery-browser-photo";
const fixtureHost = "https://gallery-v2-fixture.invalid";
const photo = {
  id: photoId, albumId, caption: "Фото V2", status: "ready",
  thumbUrl: fixtureHost + "/thumb.webp",
  fullUrl: fixtureHost + "/full.webp",
  urlsExpireAt: expiry, width: 900, height: 600,
};
const pageInfo = (items) => ({
  items, nextCursor: null, isOwner: true, enabled: true, usedSlots: 0, limit: 200,
});
const profile = {
  ...user, email: null, profile: {
    fullName: "Тестовый владелец", city: null, about: null,
    telegram: null, instagram: null, website: null, birthDate: null,
  },
};
async function main() {
  const syntheticWebp = await sharp({
    create: { width: 900, height: 600, channels: 3, background: "#567f96" },
  }).webp({ quality: 78 }).toBuffer();
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true, userDataDir: path.join(scratch, "chrome-auth-profile"),
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  try {
    for (const screen of [
      { name: "desktop", width: 1280, height: 800, isMobile: false },
      { name: "mobile", width: 390, height: 844, isMobile: true },
    ]) {
      const tab = await browser.newPage();
      await tab.setViewport({ width: screen.width, height: screen.height,
        deviceScaleFactor: 1, isMobile: screen.isMobile, hasTouch: screen.isMobile });
      await tab.setRequestInterception(true);
      const requests = [];
      const refusedExternal = new Set();
      tab.on("request", (req) => {
        const url = new URL(req.url());
        if (url.origin === fixtureHost && ["/thumb.webp", "/full.webp"].includes(url.pathname)) {
          req.respond({ status: 200, contentType: "image/webp", body: syntheticWebp,
            headers: { "cache-control": "private, max-age=180" } });
          return;
        }
        if (url.pathname.startsWith("/api/v1/") && url.origin === origin) {
          requests.push(req.method() + " " + url.pathname);
          let data, status = 200;
          if (url.pathname === "/api/v1/auth/me") data = user;
          else if (url.pathname === "/api/v1/user/profile") data = profile;
          else if (url.pathname === "/api/v1/gallery/profiles/" + user.username + "/albums")
            data = pageInfo([album]);
          else if (url.pathname === "/api/v1/gallery/albums/" + albumId)
            data = album;
          else if (url.pathname === "/api/v1/gallery/albums/" + albumId + "/photos")
            data = pageInfo([photo]);
          else if (url.pathname === "/api/v1/gallery/photos/" + photoId)
            data = photo;
          else { status = 404; }
          req.respond({
            status, contentType: "application/json",
            headers: { "cache-control": "no-store" },
            body: JSON.stringify(status === 200 ? { success: true, data } :
              { success: false, error: "Synthetic endpoint not implemented", code: "NOT_FOUND" }),
          });
          return;
        }
        if (["localhost", "127.0.0.1"].includes(url.hostname) ||
          ["data:", "blob:", "about:"].includes(url.protocol)) {
          req.continue();
          return;
        }
        refusedExternal.add(url.origin);
        req.abort("blockedbyclient");
      });
      const jsErrors = [];
      tab.on("pageerror", (error) => jsErrors.push(error.message));
      await tab.goto(origin + "/profile/albums", {
        waitUntil: "domcontentloaded", timeout: 25000,
      });
      // The first-visit cookie consent floats over mobile photo cells.
      // Exercise a real user decline before gallery interactions.
      const consentButtons = await tab.$$('[data-next-cookie-consent] button');
      for (const button of consentButtons) {
        const name = await button.evaluate(el => el.textContent?.trim());
        if (name === "Отклонить") {
          await button.click();
          break;
        }
      }
      try { await tab.waitForSelector("section[data-next-gallery]", { timeout: 13000 }); }
      catch {
        console.log(JSON.stringify({
          screen: screen.name, outcome: "GALLERY_NOT_MOUNTED",
          text: (await tab.evaluate(() => document.body.innerText)).slice(0, 320),
          recentApi: requests.slice(-10), jsErrors: jsErrors.slice(0, 3),
        }));
        throw Error("GALLERY_ROUTE_NOT_MOUNTED");
      }
      const albumText = await tab.$eval("section[data-next-gallery]",
        (el) => el.innerText);
      if (!albumText.includes("Тестовый альбом V2"))
        throw Error("ALBUM_CATALOG_NOT_RENDERED");
      const card = await tab.$('a.gallery-album-card[href*="' + albumId + '"]');
      if (!card) throw Error("ALBUM_LINK_NOT_PRESENT");
      await card.click();
      await tab.waitForFunction((id) => window.location.pathname.includes(id), {
        timeout: 12000,
      }, albumId);
      const detail = await tab.waitForSelector("section[data-next-gallery]", {
        timeout: 12000,
      });
      if (!detail) throw Error("ALBUM_DETAIL_NOT_MOUNTED");
      const openPhoto = await tab.waitForSelector(
        'button[aria-label="Открыть фотографию Фото V2"]', { timeout: 12000 },
      );
      if (!openPhoto) throw Error("READY_PHOTO_NOT_SHOWN");
      await openPhoto.click();
      try {
        await tab.waitForSelector(
          '[role="dialog"][aria-label="Просмотр фотографии"]', { timeout: 8000 },
        );
      } catch (error) {
        const details = await tab.evaluate(() => ({
          text: document.body.innerText.replace(/\\s+/g, " ").slice(-700),
          buttons: [...document.querySelectorAll('button[aria-label^="Открыть фотографию"]')].map(el => ({
            label: el.getAttribute("aria-label"), disabled: el.disabled,
            rect: el.getBoundingClientRect().toJSON(),
          })),
          dialogCount: document.querySelectorAll('[role="dialog"]').length,
        }));
        await tab.screenshot({ path: path.join(scratch, screen.name + "-viewer-failed.png") });
        console.log(JSON.stringify({
          screen: screen.name, outcome: "VIEWER_FAILED", details,
          recentApi: requests.slice(-16), jsErrors: jsErrors.slice(0, 3),
        }));
        throw error;
      }
      await tab.waitForFunction(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Просмотр фотографии"]');
        return dialog?.querySelector('img')?.complete === true;
      }, { timeout: 10000 });
      const screenshot = path.join(scratch, screen.name + "-authenticated.png");
      await tab.screenshot({ path: screenshot, fullPage: false });
      const state = await tab.evaluate(() => ({
        path: window.location.pathname,
        title: document.title,
        text: document.body.innerText.replace(/\s+/g, " ").slice(0, 340),
        width: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      console.log(JSON.stringify({
        screen: screen.name, outcome: "PASS", ...state,
        blockedExternalOriginCount: refusedExternal.size,
        jsErrorCount: jsErrors.length, apiRequests: requests.length,
      }));
      if (state.width > screen.width + 1) throw Error("HORIZONTAL_OVERFLOW");
      if (jsErrors.length) throw Error("BROWSER_JS_ERROR");
      await tab.close();
    }
  } finally {
    await browser.close();
    fs.rmSync(path.join(scratch, "chrome-auth-profile"), { recursive: true, force: true });
  }
}
main().catch((err) => {
  console.error("GALLERY_V2_BROWSER_AUTH_SMOKE_FAILED", err.message);
  process.exitCode = 1;
});
