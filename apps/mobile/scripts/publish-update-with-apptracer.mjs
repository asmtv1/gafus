import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  uploadAppTracerSourceMaps,
  versionNameForUpdateId,
} from "./upload-apptracer-sourcemaps.mjs";

const appRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function runEasUpdate(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      "eas",
      ["update", ...args, "--emit-metadata", "--json", "--non-interactive"],
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
  if (!process.env.TRACER_SOURCEMAP_TOKEN_MOBILE?.trim()) {
    throw new Error(
      "TRACER_SOURCEMAP_TOKEN_MOBILE must be configured before publishing an OTA update",
    );
  }

  const output = await runEasUpdate(process.argv.slice(2));
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
