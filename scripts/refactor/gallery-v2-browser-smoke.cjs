"use strict";
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");
const root = "/Users/asmtv1/Desktop/gafus-refactor";
if (fs.realpathSync(process.cwd()) !== root) throw Error("OUTSIDE_GAFUS_REFACTOR");
const origin = "http://127.0.0.1:5173";
const scratch = path.join(root, ".local-pg-scratch", "gallery-v2-browser-smoke");
fs.mkdirSync(scratch, { recursive: true });
const executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
async function main() {
  const browser = await puppeteer.launch({
    executablePath, headless: true, userDataDir: path.join(scratch, "chrome-profile"),
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  try {
    for (const screen of [
      { name: "desktop", width: 1280, height: 800, isMobile: false },
      { name: "mobile", width: 390, height: 844, isMobile: true },
    ]) {
      const page = await browser.newPage();
      await page.setViewport({
        width: screen.width, height: screen.height, isMobile: screen.isMobile,
        deviceScaleFactor: 1, hasTouch: screen.isMobile,
      });
      const blockedOrigins = new Set();
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        let allowed = false;
        try {
          const url = new URL(req.url());
          allowed = ["data:", "blob:", "about:"].includes(url.protocol) ||
            (["http:", "ws:"].includes(url.protocol) &&
              ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
        } catch {}
        if (!allowed) {
          try { blockedOrigins.add(new URL(req.url()).origin); } catch {}
          req.abort("blockedbyclient");
        } else req.continue();
      });
      const failures = [];
      page.on("pageerror", (error) => failures.push(String(error.message).slice(0, 120)));
      await page.goto(origin + "/profile/albums", { waitUntil: "domcontentloaded", timeout: 20000 });
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const result = await page.evaluate(() => ({
        url: window.location.pathname,
        title: document.title,
        text: document.body.innerText.replace(/\s+/g, " ").slice(0, 250),
        pageWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      await page.screenshot({ path: path.join(scratch, screen.name + ".png"), fullPage: false });
      console.log(JSON.stringify({
        screen: screen.name, ...result,
        blockedExternalOriginCount: blockedOrigins.size,
        jsErrors: failures.length, errorKinds: failures.slice(0, 3),
      }));
      await page.close();
    }
  } finally {
    await browser.close();
    fs.rmSync(path.join(scratch, "chrome-profile"), { recursive: true, force: true });
  }
}
main().catch((err) => { console.error("GALLERY_V2_BROWSER_SMOKE_FAILED", err.message); process.exitCode = 1; });
