import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DIST = fileURLToPath(new URL("../../apps/web-vite/dist/index.html", import.meta.url));
const ASSETS = fileURLToPath(new URL("../../apps/web-vite/dist/assets/", import.meta.url));

async function freeLoopbackPort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const addr = listener.address();
  assert.ok(addr && typeof addr === "object");
  const port = addr.port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function ready(base, child) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode !== null) throw new Error("Vite preview exited before ready");
    try {
      const result = await fetch(base + "/", { headers: { Accept: "text/html" } });
      if (result.status === 200) return;
    } catch {
      // Loopback-only port isn't accepting connections yet.
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("Vite preview did not start on loopback");
}

test("built Vite SPA supports deep-link HTML fallback, no PWA or API proxy", {
  timeout: 15_000,
}, async () => {
  assert.equal(existsSync(DIST), true, "Run the Vite build before smoke test");
  const chunks = readdirSync(ASSETS);
  // Prevent a future eager import from silently restoring the original
  // 1.37 MB main JS file. This checks the actual built artifact, not source
  // syntax or chunk naming alone; gzip sizes are reported separately.
  const builtHtml = readFileSync(DIST, "utf8");
  const entry = builtHtml.match(/<script type="module" crossorigin src="\/assets\/(index-[^"]+\.js)"/);
  assert.ok(entry, "Missing Vite SPA main entry");
  const mainJsBytes = statSync(join(ASSETS, entry[1])).size;
  assert.ok(mainJsBytes < 500_000,
    `Main Web JS exceeded 500 kB budget: ${mainJsBytes} bytes`);
  // Connected and heavier route screens must remain demand-loaded, never
  // promoted to a preload of every landing/login page.
  for (const feature of [
    "CourseCatalog-", "CourseOverview-", "TrainingIndexOptInHarness-",
    "DailyCourseOptInHarness-", "ProfileOverview-", "PetDetails-",
    "PetVetVisits-", "RemindersConnectedPage-", "SubscriptionCheckout-",
    "ConsultationsLivePage-", "AccountMutationPage-",
    "AuthPanel-", "PublicLanding-", "PasswordRecovery-", "VkConsentWeb-",
  ]) {
    assert.ok(chunks.some(name => name.startsWith(feature) && name.endsWith(".js")),
      "Route chunk must exist for " + feature);
    assert.equal(builtHtml.includes(`rel="modulepreload" crossorigin href="/assets/${feature}`), false,
      "Heavy route must not be eagerly preloaded: " + feature);
  }
  for (const feature of [
    "QuestionCatalog-", "QuestionDetails-", "QuestionCreate-",
    "MomentsCatalog-", "MomentDetails-", "MomentsSaved-",
    "MomentComposer-", "MomentDrafts-", "MomentsProfile-",
  ]) {
    assert.ok(chunks.some(name => name.startsWith(feature) && name.endsWith(".js")),
      "Web questions must be route-split: " + feature);
  }
  const port = await freeLoopbackPort();
  const base = "http://127.0.0.1:" + port;
  const child = spawn("pnpm", [
    "--filter", "@gafus/web-vite", "exec", "vite", "preview",
    "--config", "vite.config.mjs",
    "--host", "127.0.0.1", "--port", String(port), "--strictPort",
  ], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, VITE_API_BASE_URL: "http://127.0.0.1:4174" },
  });
  let logs = "";
  child.stdout.on("data", bytes => { logs += bytes.toString(); });
  child.stderr.on("data", bytes => { logs += bytes.toString(); });
  try {
    await ready(base, child);
    const urls = [
      "/courses", "/profile", "/pets", "/articles",
      "/pets/pet123", "/articles/obedience", "/courses/course-A",
      "/questions", "/questions/question-A", "/questions/new",
      "/moments", "/moments/post-A", "/moments/saved",
      "/moments/new", "/moments/drafts", "/moments/drafts/post-A",
      "/moments/profile/trainer",
      "/passwordReset", "/reset-password?token=unit-test", "/unknown-route",
    ];
    for (const path of urls) {
      const response = await fetch(base + path, { headers: { Accept: "text/html" } });
      assert.equal(response.status, 200, path + ": " + logs);
      const html = await response.text();
      assert.match(html, /<div id="root"><\/div>/, path);
      assert.match(html, /<script type="module"/, path);
    }
    for (const path of ["/sw.js", "/manifest.json"]) {
      const response = await fetch(base + path, { headers: { Accept: "application/json" } });
      assert.equal(response.status, 404, path);
    }
    const api = await fetch(base + "/api/v1/auth/me", {
      headers: { Accept: "application/json" },
    });
    assert.equal(api.status, 404, "Static preview must NOT proxy real APIs");
  } finally {
    if (child.pid) {
      try { process.kill(-child.pid, "SIGTERM"); } catch {
        try { child.kill("SIGTERM"); } catch { /* Already stopped. */ }
      }
    }
  }
});
