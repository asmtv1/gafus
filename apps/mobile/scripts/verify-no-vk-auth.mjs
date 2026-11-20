#!/usr/bin/env node
/**
 * Store release gate: VK OAuth must be absent from active Expo sources,
 * resolved native URL schemes and exported JS. Historical database account
 * links and API HTTP 410 compatibility error are deliberately not scanned.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const forbidden = [
  /\buseVkLogin\b/, /\buseVkLink\b/, /\bloginViaVk\b/,
  /\bvkConsentToken\b/, /\bpendingVkConsent\b/, /\bVK_CLIENT_ID(?:_IOS|_ANDROID)?\b/,
  /\bVK_MOBILE_REDIRECT_URI\b/, /(?:\/vk-consent|\/vk-set-phone|\/vk-web\/start)/,
  /vk[0-9]+:\/\//i,
];
const failures = [];
function inspectText(file) {
  const text = readFileSync(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(text)) failures.push(`${file}: ${pattern}`);
  }
}
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") || entry === "node_modules" || entry === "dist") continue;
    const file = resolve(dir, entry);
    if (statSync(file).isDirectory()) { walk(file); continue; }
    if (![".ts",".tsx",".js",".jsx"].includes(extname(file)) || /\.test\.[jt]sx?$/.test(file)) continue;
    inspectText(file);
  }
}
walk(resolve(mobileRoot,"app"));
walk(resolve(mobileRoot,"src"));
inspectText(resolve(mobileRoot,"app.config.js"));
inspectText(resolve(mobileRoot,"app.json"));
inspectText(resolve(mobileRoot,"eas.json"));

const config = spawnSync("pnpm", ["exec","expo","config","--json"], {
  cwd: mobileRoot, encoding:"utf8", maxBuffer: 16 * 1024 * 1024,
});
if (config.status !== 0) throw new Error(`EXPO_CONFIG_FAILED: ${config.stderr}`);
const cfg = JSON.parse(config.stdout);
for (const pattern of forbidden) {
  if (pattern.test(config.stdout)) failures.push(`EXPO_PUBLIC_CONFIG: ${pattern}`);
}
const schemes = (Array.isArray(cfg.scheme) ? cfg.scheme : [cfg.scheme]).filter(Boolean);
if (!schemes.includes("gafus")) failures.push("GAFUS_SCHEME_MISSING");
for (const scheme of schemes) if (/^vk\d+$/i.test(scheme)) failures.push(`VK_NATIVE_SCHEME: ${scheme}`);
for (const intent of cfg.android?.intentFilters ?? [])
  for (const data of intent.data ?? [])
    if (/^vk\d+$/i.test(data.scheme ?? "") || data.host === "vk.ru")
      failures.push("VK_ANDROID_INTENT");
for (const entry of cfg.ios?.infoPlist?.CFBundleURLTypes ?? [])
  for (const scheme of entry.CFBundleURLSchemes ?? [])
    if (/^vk\d+$/i.test(scheme)) failures.push("VK_IOS_SCHEME");

const bundleArg = process.argv.indexOf("--bundle-dir");
if (bundleArg !== -1) {
  const path = process.argv[bundleArg + 1];
  if (!path || !existsSync(path)) throw new Error("BUNDLE_PATH_MISSING");
  const bundleForbidden = /(?:\/vk-consent|\/vk-set-phone|\buseVkLogin\b|\bVK_ID_OAUTH_SCOPE\b|vk\d+:\/\/vk\.ru)/;
  const scanBundle = (directory) => {
    for (const item of readdirSync(directory)) {
      const file = resolve(directory, item);
      if (statSync(file).isDirectory()) { scanBundle(file); continue; }
      if (!/\.(?:js|hbc|bundle)$/.test(file)) continue;
      const content = readFileSync(file);
      if (bundleForbidden.test(content.toString("utf8"))) failures.push(`VK_BUNDLE_REFERENCE: ${file}`);
    }
  };
  scanBundle(resolve(path));
}
if (failures.length) {
  console.error("VK_AUTH_REMOVAL_GATE_FAILED\n" + failures.join("\n"));
  process.exit(1);
}
console.log("VK_AUTH_REMOVAL_GATE_OK: Expo sources and native schemes clean");
