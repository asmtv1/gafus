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
  // Prefer bundletool when provided; otherwise parse the actual protobuf
  // AndroidManifest.xml from the AAB using the same parser as the OTA guard.
  const manifest = aab ? (bundletool
    ? execFileSync("java", ["-jar", bundletool, "dump", "manifest", `--bundle=${filename}`], {
      encoding: "utf8", timeout: 30_000,
    })
    : execFileSync("python3", ["-c", [
      "import importlib.util, sys, zipfile, xml.etree.ElementTree as ET",
      "spec = importlib.util.spec_from_file_location('native_ota', sys.argv[1])",
      "module = importlib.util.module_from_spec(spec)",
      "spec.loader.exec_module(module)",
      "ET.register_namespace('android', module.ANDROID)",
      "with zipfile.ZipFile(sys.argv[2]) as archive:",
      "    root = module.aab_element(archive.read('base/manifest/AndroidManifest.xml'))",
      "    print(ET.tostring(root, encoding='unicode'))",
    ].join("\n"), fileURLToPath(new URL("./verify-native-ota-artifact.py", import.meta.url)), filename], {
      encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
    })) : readFileSync(filename, "utf8");
  verifyAndroidMediaPermissions(manifest);
  console.log("ANDROID_MEDIA_PERMISSIONS_PASS");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
