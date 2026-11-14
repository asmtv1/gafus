#!/usr/bin/env node
/** Offline stage only. No network, S3, production publish or source modifications. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { buildSignedOtaArtifact, verifyAndWriteLocalPreview } from "./self-hosted-ota-artifact.mjs";

const options = {};
const permitted = new Set([
  "export-root", "expo-config", "native-release", "private-key", "certificate",
  "cdn-base", "asset-base", "update-id", "created-at", "revision", "source-sha", "native-fingerprint",
  "environment", "platform", "channel", "runtime", "signing-key-id", "output-dir", "repo-root",
]);
const args = process.argv.slice(2);
if (args.includes("--help") || args.length === 0) {
  console.log(`Prepare signed offline OTA artifact from a frozen Expo export.
Required: ${[...permitted].filter((arg) => !["cdn-base", "asset-base"].includes(arg)).map((arg) => `--${arg} VALUE`).join(" ")}
Additionally specify --asset-base URL (or legacy --cdn-base URL), exactly one.
Never pass a signing private key directly on the command line; pass a protected file path.
Production requires CI confirmation plus an independently verified native release.`);
  process.exit(args.length === 0 ? 2 : 0);
}
for (let i=0; i<args.length; i+=2) {
  const name = args[i]?.replace(/^--/, "");
  if (!args[i]?.startsWith("--") || !permitted.has(name) || !args[i+1] || args[i+1].startsWith("--") ||
    Object.prototype.hasOwnProperty.call(options, name))
    throw new Error("INVALID_OR_DUPLICATED_OTA_ARGUMENT");
  options[name] = args[i+1];
}
if ([...permitted].filter((key) => key !== "cdn-base" && key !== "asset-base").some((key) => !options[key]) ||
    (!!options["cdn-base"] === !!options["asset-base"]))
  throw new Error("MISSING_OTA_ARTIFACT_ARGUMENT");
if (options.environment === "production") {
  if (process.env.CI !== "true" || process.env.GAFUS_OTA_PRODUCTION_APPROVED !== "true")
    throw new Error("PRODUCTION_OTA_REQUIRES_PROTECTED_CI_APPROVAL");
}
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: path.resolve(options["repo-root"]), encoding: "utf8",
}).trim();
if (sourceSha !== options["source-sha"])
  throw new Error("OTA_FROZEN_SOURCE_SHA_MISMATCH");
const dirty = execFileSync("git", ["status", "--porcelain"], {
  cwd: path.resolve(options["repo-root"]), encoding: "utf8",
}).trim();
if (dirty) throw new Error("OTA_SOURCE_CHECKOUT_NOT_FROZEN");
const privateKeyInfo = fs.statSync(options["private-key"]);
if ((privateKeyInfo.mode & 0o077) !== 0)
  throw new Error("OTA_PRIVATE_KEY_PERMISSIONS_TOO_BROAD");
new crypto.X509Certificate(fs.readFileSync(options.certificate));
const release = JSON.parse(fs.readFileSync(options["native-release"], "utf8"));
const metadata = JSON.parse(fs.readFileSync(path.join(options["export-root"], "metadata.json"), "utf8"));
const expoConfig = JSON.parse(fs.readFileSync(options["expo-config"], "utf8"));
const artifact = buildSignedOtaArtifact({
  exportRoot: options["export-root"], metadata, publicExpoConfig: expoConfig,
  native: release, platform: options.platform, environment: options.environment,
  runtimeVersion: options.runtime, channel: options.channel,
  sourceSha: options["source-sha"], nativeFingerprint: options["native-fingerprint"],
  signingKeyId: options["signing-key-id"], publicCdnBase: options["asset-base"] ?? options["cdn-base"],
  updateId: options["update-id"], createdAt: options["created-at"],
  revision: Number(options.revision),
  privateKeyPem: fs.readFileSync(options["private-key"], "utf8"),
  certificatePem: fs.readFileSync(options.certificate, "utf8"),
});
const output = verifyAndWriteLocalPreview({
  artifact, exportRoot: options["export-root"], outputDir: options["output-dir"],
});
console.log(JSON.stringify({
  state: "OFFLINE_SIGNED_NOT_UPLOADED",
  output, updateId: artifact.updateId,
  sourceSha, platform: artifact.platform, runtime: artifact.runtimeVersion,
  assetCount: artifact.inventory.length,
  manifestSha256: crypto.createHash("sha256").update(artifact.manifestBytes).digest("hex"),
}));
