import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function source(relative) {
  const path = join(ROOT, relative);
  assert.equal(lstatSync(path).isSymbolicLink(), false, "Must not follow symlink: " + relative);
  return readFileSync(path, "utf8");
}

test("new Vite Web has no PWA manifest or plugins", () => {
  const html = source("apps/web-vite/index.html");
  const config = source("apps/web-vite/vite.config.mjs");
  const pkg = JSON.parse(source("apps/web-vite/package.json"));
  assert.doesNotMatch(html, /rel=["']manifest/i);
  // Ignore commentary that explains the absence of PWA dependencies.
  const activeConfig = config.split(String.fromCharCode(10)).filter(line => !line.trimStart().startsWith("//")).join(" ");
  assert.doesNotMatch(activeConfig, /workbox|next-pwa|vite-plugin-pwa/i);
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  assert.equal(deps.some(name => /pwa|workbox|webpush|web-push/i.test(name)), false);
});

test("Vite bootstraps only retirement, never registers new SW or Web Push", () => {
  const bootstrap = source("apps/web-vite/src/main.tsx");
  const retirement = source("apps/web-vite/src/shared/pwa-retirement/retireLegacyPwa.ts");
  assert.match(bootstrap, /retireLegacyPwaInBrowser/);
  assert.doesNotMatch(bootstrap, /serviceWorker\.register|pushManager\.subscribe/);
  assert.doesNotMatch(retirement, /serviceWorker\.register|pushManager\.subscribe/);
});

test("automatic SW retirement does not authorize cache deletion", () => {
  const retirement = source("apps/web-vite/src/shared/pwa-retirement/retireLegacyPwa.ts");
  assert.match(retirement, /if \(context\.allowLegacyCacheDeletion && context\.caches\)/);
  const body = retirement.split("export async function retireLegacyPwaInBrowser")[1];
  assert.equal(body.includes("allowLegacyCacheDeletion: true"), false);
  assert.equal(body.includes("indexedDB.deleteDatabase"), false);
});

test("Trainer installation PWA metadata and manifest are removed", () => {
  const layout = source("apps/trainer-panel/src/app/layout.tsx");
  const installHints = /rel=["']manifest|manifest:\s*["']|appleWebApp|mobile-web-app-capable/i;
  assert.doesNotMatch(layout, installHints);
  assert.equal(existsSync(join(ROOT, "apps/trainer-panel/public/manifest.json")), false);
});

test("Trainer/Admin middleware no longer allow removed PWA routes specially", () => {
  for (const app of ["trainer-panel", "admin-panel"]) {
    const middleware = source("apps/" + app + "/src/middleware.ts");
    assert.doesNotMatch(middleware, /manifest\.json|sw\.js|workbox-/i);
  }
});

test("legal consent documents are identical in Next and new Vite static assets", () => {
  for (const document of [
    "personal.html", "policy.html", "personal-distribution.html",
  ]) {
    const original = source("apps/web/public/" + document);
    const copied = source("apps/web-vite/public/" + document);
    assert.equal(copied, original, document + " differs from legal source");
  }
});
