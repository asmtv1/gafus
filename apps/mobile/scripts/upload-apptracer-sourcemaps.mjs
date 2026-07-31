import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { uploadSourceMap } from "@apptracer/sourcemap";

const appRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(readFileSync(resolve(appRoot, "package.json"), "utf8"));

export function versionNameForUpdateId(updateId) {
  return `${packageJson.version}-ota.${updateId.replaceAll("-", "").slice(0, 12)}`;
}

export async function uploadAppTracerSourceMaps({
  sourceMapsPath = resolve(appRoot, "dist"),
  versionName,
  versionCode,
} = {}) {
  const token = process.env.TRACER_SOURCEMAP_TOKEN_MOBILE?.trim();
  if (!token) {
    throw new Error(
      "TRACER_SOURCEMAP_TOKEN_MOBILE is required (pluginToken of the AppTracer mobile-js project)",
    );
  }
  if (!versionName) {
    throw new Error(
      "A source-map version is required. Set TRACER_SOURCEMAP_VERSION_NAME or publish through update:ota:*",
    );
  }
  if (!existsSync(sourceMapsPath)) {
    throw new Error(`Source-map directory does not exist: ${sourceMapsPath}`);
  }

  await new Promise((resolveUpload, rejectUpload) => {
    uploadSourceMap(sourceMapsPath, {
      sourcemapToken: token,
      versionName,
      ...(versionCode ? { versionCode } : {}),
      onSuccess: resolveUpload,
      onError: rejectUpload,
    });
  });
  console.log(`[AppTracer] source maps uploaded for ${versionName}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceMapsPath = resolve(appRoot, process.argv[2] ?? "dist");
  const versionName = process.env.TRACER_SOURCEMAP_VERSION_NAME?.trim();
  const parsedVersionCode = Number.parseInt(process.env.TRACER_SOURCEMAP_VERSION_CODE ?? "", 10);

  uploadAppTracerSourceMaps({
    sourceMapsPath,
    versionName,
    versionCode: Number.isSafeInteger(parsedVersionCode) ? parsedVersionCode : undefined,
  }).catch((error) => {
    console.error(`[AppTracer] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
