#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const blocked = [
  "READ_MEDIA_IMAGES",
  "READ_MEDIA_VIDEO",
  "READ_MEDIA_VISUAL_USER_SELECTED",
  "READ_EXTERNAL_STORAGE",
  "WRITE_EXTERNAL_STORAGE",
];
const required = [
  "CAMERA",
  "RECORD_AUDIO",
  "ACTIVITY_RECOGNITION",
  "ACCESS_COARSE_LOCATION",
  "ACCESS_FINE_LOCATION",
  "ACCESS_BACKGROUND_LOCATION",
  "FOREGROUND_SERVICE",
  "FOREGROUND_SERVICE_LOCATION",
];

export function verifyAndroidMediaPermissions(manifest) {
  const permissions = new Set(
    Array.from(manifest.matchAll(/<uses-permission(?:-sdk-23)?\s[^>]*>/g), ([tag]) =>
      /\bandroid:name=["']android\.permission\.([^"']+)["']/.exec(tag)?.[1]),
  );
  const present = blocked.filter(name => permissions.has(name));
  const missing = required.filter(name => !permissions.has(name));
  if (present.length || missing.length) {
    throw new Error(`ANDROID_MEDIA_PERMISSIONS_FAILED ${JSON.stringify({ present, missing })}`);
  }
}

function main() {
  const [filename] = process.argv.slice(2);
  if (!filename || process.argv.length !== 3) {
    throw new Error("Usage: verify-android-media-permissions.mjs <merged AndroidManifest.xml|app.aab>");
  }
  const bundletool = process.env.BUNDLETOOL_JAR;
  const aab = filename.endsWith(".aab");
  if (aab && !bundletool) throw new Error("Set BUNDLETOOL_JAR to the bundletool-all JAR");
  const manifest = aab ? execFileSync("java", ["-jar", bundletool, "dump", "manifest", `--bundle=${filename}`], {
    encoding: "utf8", timeout: 30_000,
  }) : readFileSync(filename, "utf8");
  verifyAndroidMediaPermissions(manifest);
  console.log("ANDROID_MEDIA_PERMISSIONS_PASS");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
