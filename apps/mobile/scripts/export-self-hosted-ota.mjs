#!/usr/bin/env node
/** Build JS with an embedded revision without patching any tracked sources. */
import path from "node:path";
import fs from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { paymentProfile } from "./ota-payment-profile.mjs";
import { smartTrackingQaEnv } from "./smart-tracking-qa-env.mjs";

const mobileRoot = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = path.resolve(mobileRoot, "../..");

function run(program, args, { env = process.env, stdio = "inherit" } = {}) {
  const out = spawnSync(program, args, {
    cwd: mobileRoot, env, stdio, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (out.error) throw out.error;
  if (out.status !== 0) throw Error(`SELF_HOSTED_EXPORT_COMMAND_FAILED_${program}_${out.status}`);
  return out.stdout;
}

function main() {
  const [platform, revisionRaw, outputDir, configFile] = process.argv.slice(2);
  const revision = Number(revisionRaw);
  if (!["ios", "android"].includes(platform) || !/^[1-9]\d*$/.test(revisionRaw ?? "") ||
      !Number.isSafeInteger(revision) || !outputDir || !configFile)
    throw Error("USAGE: export-self-hosted-ota.mjs <ios|android> <revision> <outputDir> <configFile>");
  if (process.env.GAFUS_OTA_TRANSPORT !== "self-hosted" ||
      process.env.GAFUS_OTA_TARGET_PLATFORM !== platform)
    throw Error("SELF_HOSTED_EXPORT_NATIVE_PROFILE_REQUIRED");

  const profile = paymentProfile();
  if (profile !== "standard" && process.env.OTA_PLATFORM !== platform)
    throw Error("PAYMENT_PROFILE_PLATFORM_MISMATCH");
  if (execFileSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" }).trim())
    throw Error("SELF_HOSTED_EXPORT_CHECKOUT_MUST_BE_CLEAN");
  const target = path.resolve(outputDir);
  if (fs.existsSync(target) && fs.readdirSync(target).length)
    throw Error("SELF_HOSTED_EXPORT_OUTPUT_MUST_BE_EMPTY");
  fs.mkdirSync(path.dirname(target), { recursive: true });

  if (platform === "ios") run("node", ["scripts/verify-ios-payment-graph.mjs"]);
  run("pnpm", ["exec", "expo", "export", "--platform", platform,
    "--output-dir", target, "--source-maps", "external"], {
    env: {
      ...process.env,
      ...smartTrackingQaEnv(process.env),
      EXPO_PUBLIC_OTA_REVISION_STAMP: `gafus-ota-revision:${revision}`,
      EXPO_OVERRIDE_METRO_CONFIG: path.join(mobileRoot, "scripts/self-hosted-ota-metro.config.mjs"),
    },
  });
  run("node", [`scripts/verify-${platform}-payment-export.mjs`, target, profile]);
  const configJson = run("pnpm", ["exec", "expo", "config", "--type", "public", "--json"], { stdio: "pipe" });
  const config = JSON.parse(configJson);
  if (config.updates?.url === undefined ||
      config.extra?.otaTransport !== "self-hosted" || config.version === undefined ||
      config.extra?.otaReleaseVersion !== process.env.EXPO_PUBLIC_APP_VERSION)
    throw Error("EXPORTED_NATIVE_PROFILE_OR_RELEASE_VERSION_MISMATCH");
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ status: "EXPORTED_UNPUBLISHED", platform, revision, outputDir: target, configFile }));
}
try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
