import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const files = [
  "apps/web-vite/public/oferta.html",
  "apps/web-vite/public/policy.html",
  "apps/web-vite/public/legal/archive/oferta-2026-08-13.html",
  "apps/web-vite/public/images/gafus-logo-mascot.webp",
  "apps/web-vite/src/brand/Header.module.css",
  "apps/web-vite/src/shared/media/browserStorageUploadUrl.ts",
];
const missing = files.filter(file => !existsSync(resolve(root, file)));
if (missing.length) {
  console.error("Missing required current Vite assets:", missing.join(", "));
  process.exitCode = 1;
} else {
  const pkg = JSON.parse(readFileSync(resolve(root, "apps/web-vite/package.json"), "utf8"));
  if (pkg.dependencies?.next || pkg.dependencies?.["next-auth"]) throw Error("Next dependency in Web Vite");
  console.log(`Verified ${files.length} current Vite assets`);
}
