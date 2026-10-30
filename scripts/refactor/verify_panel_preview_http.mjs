/** AG4 only: reproducible mock-preview HTTP smoke on 127.0.0.1, no external calls. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { preview } from "vite";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
assert.equal(process.cwd(), ROOT);
assert.equal(realpathSync(ROOT), ROOT);
assert.equal(execFileSync("git", ["-C", ROOT, "rev-parse", "--show-toplevel"],
  { encoding: "utf8" }).trim(), ROOT);
assert.equal(execFileSync("git", ["-C", ROOT, "branch", "--show-current"],
  { encoding: "utf8" }).trim(), "vite");

function safe(relative) {
  assert(!path.isAbsolute(relative) && !relative.split("/").includes(".."));
  let result = ROOT;
  for (const part of relative.split("/")) {
    assert(part && part !== ".");
    result = path.join(result, part);
    assert(!lstatSync(result).isSymbolicLink(), "symlink refused: " + relative);
  }
  return result;
}
const frozen = JSON.parse(readFileSync(
  safe("docs/refactor/coordination/BASELINE.json"), "utf8"));

for (const [app, area, count] of [
  ["trainer-panel", "trainer", 29], ["admin-panel", "admin", 21],
]) {
  const prefix = "apps/" + app + "/src/vite-preparation/preview";
  const html = readFileSync(safe(prefix + "/dist/index.html"), "utf8");
  assert.match(html, /noindex, nofollow/);
  assert.doesNotMatch(html, /rel="manifest"|serviceWorker/i);
  const assets = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)]
    .map(match => match[1]);
  assert.equal(assets.length, 2);
  for (const asset of assets) safe(prefix + "/dist/" + asset);

  const server = await preview({
    root: safe(prefix), logLevel: "silent",
    preview: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  try {
    const address = server.httpServer.address();
    assert(address && typeof address !== "string");
    assert.equal(address.address, "127.0.0.1");
    const origin = "http://127.0.0.1:" + address.port;
    async function check(uri, expected, type) {
      const r = await fetch(origin + uri, {
        redirect: "manual", signal: AbortSignal.timeout(4000),
      });
      assert.equal(r.status, expected, app + " " + uri);
      assert.match(r.headers.get("content-type") ?? "", type);
      return r.text();
    }
    const pages = frozen[area].pages.map(({ url }) =>
      url.replace(/\[[A-Za-z][A-Za-z0-9]*\]/g, "id-123"));
    assert.equal(pages.length, count);
    for (const uri of pages) {
      const body = await check(uri, 200, /text\/html/);
      assert(body.includes('id="root"'));
    }
    for (const asset of assets) {
      const body = await check("/" + asset, 200,
        asset.endsWith(".js") ? /javascript/ : /text\/css/);
      assert(body.length > 100);
    }
    for (const uri of [
      "/api", "/api/v1/user/profile", "/api%2Fv1%2Fuser%2Fprofile",
      "/manifest.json", "/manifest.webmanifest", "/sw.js",
      "/service-worker.js", "/workbox-demo.js",
    ]) {
      const body = await check(uri, 404, /text\/plain/);
      assert(!body.includes("<html"));
    }
    const unknown = await check("/unknown-ag4-page", 200, /text\/html/);
    assert(unknown.includes('id="root"'));
    console.log("PASS AG4-HTTP", app, pages.length,
      "deep links, 2 local assets, 8 blocked API/PWA paths, SPA fallback");
  } finally {
    await new Promise((resolve, reject) =>
      server.httpServer.close(error => error ? reject(error) : resolve()));
  }
}
