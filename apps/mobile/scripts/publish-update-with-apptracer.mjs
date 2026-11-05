import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  uploadAppTracerSourceMaps,
  versionNameForUpdateId,
} from "./upload-apptracer-sourcemaps.mjs";
import { withCompiledOtaRevision } from "./ota-revision-release.mjs";

const appRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function runEasUpdate(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      "npx",
      ["--yes", "eas-cli@27.4.1", "update", ...args, "--emit-metadata", "--json", "--non-interactive"],
      {
        cwd: appRoot,
        env: process.env,
        stdio: ["inherit", "pipe", "inherit"],
      },
    );
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun(stdout);
        return;
      }
      rejectRun(
        new Error(
          `eas update failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`,
        ),
      );
    });
  });
}

function collectPublishedUpdates(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectPublishedUpdates(item, result);
    return result;
  }
  if (!value || typeof value !== "object") return result;

  if (typeof value.id === "string" && (value.platform === "ios" || value.platform === "android")) {
    result.push({ id: value.id, platform: value.platform });
  }
  for (const nested of Object.values(value)) collectPublishedUpdates(nested, result);
  return result;
}

async function main() {
  const argv = process.argv.slice(2);
  const revisionArg = argv.indexOf("--ota-revision");
  const revision = revisionArg >= 0 ? argv[revisionArg + 1] : process.env.EXPO_PUBLIC_OTA_REVISION;
  const easArgs = revisionArg >= 0
    ? argv.filter((_, index) => index !== revisionArg && index !== revisionArg + 1)
    : argv;
  const isProduction = easArgs.includes("production");
  if (revisionArg >= 0 && (revisionArg + 1 >= argv.length || !/^[1-9]\d*$/.test(argv[revisionArg + 1]))) {
    throw new Error("OTA_REVISION_INVALID: --ota-revision must be a positive integer");
  }
  if (isProduction && (!revision || !/^[1-9]\d*$/.test(revision) || !Number.isSafeInteger(Number(revision)))) {
    throw new Error("OTA_REVISION_REQUIRED: pass --ota-revision 1 to publish 1.7.3-ota.1");
  }
  if (isProduction) {
    process.env.EXPO_PUBLIC_OTA_REVISION = revision;
    console.log(`[OTA] Publishing 1.7.3-ota.${revision} (runtime 1.7.3)`);
  }
  // Production OTA is forbidden until both NEW store binaries have been
  // published with exactly this appVersion runtime. No SDK-wide fallback.
  // The project production channel was verified to track the main branch in EAS.
  // The legacy native preflight accepts a channel name, so translate the
  // --branch main spelling only for the preflight, not for publishing.
  const branchIndex = easArgs.indexOf("--branch");
  const publishesMain = (branchIndex >= 0 && easArgs[branchIndex + 1] === "main") ||
    easArgs.some(arg => arg === "--branch=main");
  const preflightArgs = publishesMain && isProduction &&
    !easArgs.includes("--channel") && !easArgs.some(arg => arg.startsWith("--channel="))
    ? [...easArgs, "--channel", "production"] : easArgs;
  const preflight = spawnSync(process.execPath,
    [fileURLToPath(new URL("./verify-native-release.mjs", import.meta.url)),
      "--ota", ...preflightArgs],
    { cwd: appRoot, env: process.env, stdio: "inherit" });
  if (preflight.error) throw preflight.error;
  if (preflight.status !== 0) throw Error("MOBILE_OTA_NATIVE_RELEASE_PREFLIGHT_FAILED");
  if (!process.env.TRACER_SOURCEMAP_TOKEN_MOBILE?.trim()) {
    throw new Error(
      "TRACER_SOURCEMAP_TOKEN_MOBILE must be configured before publishing an OTA update",
    );
  }

  // Expo SDK55's --environment ignores build-profile-only EXPO_PUBLIC_* values.
  // Without this server-side variable, the Chat2 client fails closed after OTA.
  if (isProduction && process.env.EXPO_PUBLIC_CHAT2_API_ORIGIN !== "https://api.gafus.ru") {
    throw new Error(
      "OTA_PRODUCTION_CHAT_ORIGIN_MISSING: set EAS production EXPO_PUBLIC_CHAT2_API_ORIGIN=https://api.gafus.ru before publishing",
    );
  }
  if (isProduction && process.env.EXPO_PUBLIC_APP_VERSION !== "1.7.3") {
    throw new Error(
      "OTA_PRODUCTION_APP_VERSION_MISMATCH: set EAS production EXPO_PUBLIC_APP_VERSION=1.7.3 before publishing",
    );
  }
  const output = isProduction
    ? await withCompiledOtaRevision(revision, () => runEasUpdate(easArgs))
    : await runEasUpdate(easArgs);
  const published = collectPublishedUpdates(JSON.parse(output));
  const uniqueUpdates = [
    ...new Map(published.map((update) => [`${update.platform}:${update.id}`, update])).values(),
  ];
  if (uniqueUpdates.length === 0) {
    throw new Error("EAS published the update, but no iOS/Android update IDs were found in JSON");
  }

  for (const update of uniqueUpdates) {
    const versionName = versionNameForUpdateId(update.id);
    await uploadAppTracerSourceMaps({ versionName });
    console.log(`[AppTracer] ${update.platform} update ${update.id} → ${versionName}`);
  }
}

main().catch((error) => {
  console.error(`[AppTracer] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
