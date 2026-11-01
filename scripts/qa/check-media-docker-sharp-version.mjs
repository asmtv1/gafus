#!/usr/bin/env node
// Prevent Cloud.ru media-image builds from silently reintroducing
// a vulnerable Sharp version while workspace package.json is safe.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const candidates = [
  "apps/feed-cloud/Dockerfile",
  "apps/feed-cloud/Dockerfile.chat2-job",
  "apps/feed-cloud/Dockerfile.questions-photo",
  "apps/gallery-cloud/Dockerfile",
  "apps/gallery-cloud/Dockerfile.v2",
];
const target = "0.35.5";
let installs = 0;
for (const file of candidates) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  const pins = [...content.matchAll(/sharp@(\d+\.\d+\.\d+)/g)].map(x => x[1]);
  if (!pins.length || pins.some(x => x !== target)) {
    throw new Error("UNSAFE_MEDIA_DOCKER_SHARP_PIN: " + file);
  }
  installs += pins.length;
}
for (const manifest of [
  "apps/feed-cloud/package.json",
  "apps/gallery-cloud/package.json",
  "packages/cdn-upload/package.json",
]) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, manifest), "utf8"));
  if (pkg.dependencies.sharp !== target) throw new Error("SHARP_MANIFEST_MISMATCH: " + manifest);
}
// The legacy Gallery CDN origin images were retired; check only the
// current Gallery job Dockerfile instead of reading deleted build targets.
for (const dockerfile of [
  "apps/gallery-cloud/Dockerfile",
]) {
  const content = fs.readFileSync(path.join(root, dockerfile), "utf8");
  for (const item of [
    "COPY packages/cdn-upload/src/isolatedNonprodS3.ts",
    "COPY packages/cdn-upload/src/localReadonlyCdn.ts",
    "--alias:@gafus/cdn-upload/isolated-nonprod-s3=",
    "--alias:@gafus/cdn-upload/local-readonly-cdn=",
  ]) {
    if (!content.includes(item)) throw new Error("GALLERY_BUNDLED_CDN_SOURCE_MISSING: " + dockerfile);
  }
}
for (const dockerfile of [
  "apps/feed-cloud/Dockerfile.origin",
  "apps/feed-cloud/Dockerfile.origin-staging",
]) {
  const content = fs.readFileSync(path.join(root, dockerfile), "utf8");
  for (const item of [
    "COPY packages/feed-cloud/src",
    "COPY packages/cdn-upload/src/isolatedNonprodS3.ts",
    "COPY packages/cdn-upload/src/localReadonlyCdn.ts",
    "--alias:@gafus/feed-cloud=",
    "--alias:@gafus/cdn-upload/isolated-nonprod-s3=",
    "--alias:@gafus/cdn-upload/local-readonly-cdn=",
  ]) {
    if (!content.includes(item)) throw new Error("FEED_ORIGIN_BUNDLED_SOURCE_MISSING: " + dockerfile);
  }
}
console.log("MEDIA_SHARP_PIN_PASS:",candidates.length,"Dockerfiles,",installs,
  "install pins, 3 package manifests, exact",target);
