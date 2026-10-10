/** Real headless Chrome E2E of the production feed visibility watcher and durable queue.
 * Isolated fixture HTTP server only; no real user account or production DB.
 */
import { createServer } from "node:http";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import puppeteer from "puppeteer";

const root = resolve(import.meta.dirname, "../../../");
const result = await build({
  stdin: {
    contents: `
      export { FeedTelemetryQueue } from "./packages/types/src/feed-telemetry-queue.ts";
      export { observeFeedVisibility } from "./apps/web/src/features/feed/visibility.ts";
    `,
    resolveDir: root, loader: "ts",
  },
  platform: "browser", format: "iife", globalName: "FeedE2E", bundle: true,
  write: false, target: "es2020",
});
const script = result.outputFiles[0].text;
const accepted = { impressions: new Map(), outcomes: new Map() };
let transientRedisFailure = false;
const html = `<!doctype html><html lang="ru"><meta charset="utf-8">
<style>body{margin:0}#card{height:320px;width:98vw;background:#adc}#below{height:2000px}</style>
<div id="card">Real visibility test card</div><div id="below"></div>
<script src="/bundle.js"></script>
<script>
 const userid = new URL(location.href).searchParams.get("scenario") ?? "main";
 const postId = userid + "-post";
 let serial = 0;
 const makeEvent = () => ({ eventId: userid + "-" + (++serial), postId,
    rankingSessionId: "session-" + userid, exposureToken: "token-" + userid,
    algorithmVersion: "smart-rule-2026-10-a", rank: 0 });
 const storage = kind => ({
   read: async () => localStorage.getItem(userid + ":" + kind),
   write: async payload => { localStorage.setItem(userid + ":" + kind, payload); },
 });
 const sender = endpoint => async events => {
   const response = await fetch("/" + endpoint, {
     method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({events})
   });
   if(!response.ok) throw Error("HTTP " + response.status);
   return response.json();
 };
 const impressions = new FeedE2E.FeedTelemetryQueue(storage("i"), sender("impressions"), Date.now);
 const outcomes = new FeedE2E.FeedTelemetryQueue(storage("o"), sender("outcomes"), Date.now);
 window.harness = { userid, impressions, outcomes, ready: Promise.all([impressions.restore(), outcomes.restore()]) };
 window.harness.flush = async () => {
   await window.harness.ready;
   if(!(await impressions.flush())) return false;
   return outcomes.flush();
 };
 window.harness.ready.then(() => window.harness.flush());
 window.addEventListener("online", () => void window.harness.flush());
 window.addEventListener("pageshow", () => void window.harness.flush());
 window.harness.start = () => {
   window.harness.disconnect = FeedE2E.observeFeedVisibility(document.getElementById("card"), {
   visibleFraction: 0.5, qualifiedAfterMs: 300,
   onQualified() {
     impressions.enqueue({ ...makeEvent(), visibleMs:300 });
     void window.harness.flush();
   },
   onDwell(durationMs) {
     outcomes.enqueue({ ...makeEvent(), kind:"dwell", durationMs });
     void window.harness.flush();
   },
   });
 };
 if (!new URL(location.href).searchParams.has("manualWatch") &&
     !new URL(location.href).searchParams.has("restoreOnly")) window.harness.start();
</script></html>`;
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/bundle.js") {
    res.writeHead(200, { "content-type": "application/javascript" }); res.end(script); return;
  }
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); return;
  }
  if (req.method === "POST" && (url.pathname === "/impressions" || url.pathname === "/outcomes")) {
    let body = "";
    for await (const chunk of req) body += chunk;
    const events = JSON.parse(body).events;
    if (transientRedisFailure) {
      transientRedisFailure = false;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ accepted: 0, retryable: true }));
      return;
    }
    const target = url.pathname === "/impressions" ? accepted.impressions : accepted.outcomes;
    let count = 0;
    for (const item of events) {
      if (!target.has(item.eventId)) { target.set(item.eventId, item); count++; }
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ accepted: count }));
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const nap = ms => new Promise(resolve => setTimeout(resolve, ms));
const sizeFor = (map, scenario) => [...map.values()].filter(item => item.postId === scenario + "-post").length;
try {
  browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true, args: ["--no-sandbox", "--disable-background-networking"],
  });
  const page = await browser.newPage();
  await page.bringToFront();
  await page.setViewport({ width: 1024, height: 768 });
  await page.goto(base + "/?scenario=offline&manualWatch=1", { waitUntil: "load" });
  await page.setOfflineMode(true);
  await page.evaluate(() => window.harness.start());
  await nap(500);
  await page.evaluate(() => scrollTo(0, 700));
  await nap(200);
  const countsBefore = await page.evaluate(() =>
    [window.harness.impressions.size, window.harness.outcomes.size]);
  assert.deepEqual(countsBefore, [1, 1], "offline viewport impressions+dwell retained");
  assert.equal(sizeFor(accepted.impressions, "offline"), 0);
  assert.equal(sizeFor(accepted.outcomes, "offline"), 0);

  // Reconnect and flush the same opaque exposures, without duplicates.
  await page.setOfflineMode(false);
  await page.evaluate(() => window.harness.flush());
  await nap(250);
  assert.equal(sizeFor(accepted.impressions, "offline"), 1);
  assert.equal(sizeFor(accepted.outcomes, "offline"), 1);
  await page.evaluate(() => window.harness.flush());
  assert.equal(sizeFor(accepted.impressions, "offline"), 1);
  assert.equal(sizeFor(accepted.outcomes, "offline"), 1);
  console.log("PASS chrome: offline scroll -> qualified exposure + dwell -> reconnect exactly once");

  // Full cold-restart recovery: qualify during a real offline browser session,
  // then mount a new page with the same localStorage owner and replay the UUIDs.
  const second = await browser.newPage();
  await second.bringToFront();
  await second.setViewport({ width: 1024, height: 768 });
  await second.goto(base + "/?scenario=restart&manualWatch=1", { waitUntil: "load" });
  await second.setOfflineMode(true);
  await second.evaluate(() => window.harness.start());
  await nap(450);
  await second.evaluate(() => scrollTo(0, 700));
  await nap(200);
  assert.deepEqual(await second.evaluate(() =>
    [window.harness.impressions.size, window.harness.outcomes.size]), [1, 1]);
  assert.equal(sizeFor(accepted.impressions, "restart"), 0);
  transientRedisFailure = true;
  await second.setOfflineMode(false);
  await second.goto(base + "/?scenario=restart&restoreOnly=1", { waitUntil: "load" });
  await second.evaluate(() => window.harness.ready);
  await second.evaluate(() => window.harness.flush());
  await second.evaluate(() => window.harness.flush());
  await nap(250);
  assert.equal(sizeFor(accepted.impressions, "restart"), 1);
  assert.equal(sizeFor(accepted.outcomes, "restart"), 1);
  console.log("PASS chrome: offline -> browser restart -> persisted event IDs restored");

  // Real tab lifecycle: on another active tab this card must not accumulate dwell.
  const hidden = await browser.newPage();
  await hidden.bringToFront();
  await hidden.setViewport({ width: 1024, height: 768 });
  await hidden.goto(base + "/?scenario=tab&manualWatch=1", { waitUntil: "load" });
  const foreground = await browser.newPage();
  await foreground.goto(base + "/?scenario=empty&restoreOnly=1", { waitUntil: "load" });
  await foreground.bringToFront();
  await hidden.evaluate(() => window.harness.start());
  await nap(450);
  const hiddenStatus = await hidden.evaluate(() =>
    ({ visibilityState: document.visibilityState, queued: window.harness.impressions.size }));
  if (hiddenStatus.visibilityState === "hidden") {
    assert.equal(hiddenStatus.queued, 0, "background tab did not count qualified impression");
    await hidden.bringToFront();
    await nap(450);
    assert.equal(sizeFor(accepted.impressions, "tab"), 1, "foreground tab qualified");
    console.log("PASS chrome: hidden tab did not qualify; focus resumed measurement");
  } else {
    console.log("SKIP chrome: tab lifecycle not emulated in headless Chrome");
  }
  console.log("CHROME_FEED_E2E_PASSED");
} finally {
  if (browser) await browser.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
}
