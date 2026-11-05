/**
 * Build Android locally without putting AppTracer credentials in eas.json.
 * The native config plugin needs all four tokens during the early EAS config
 * evaluation, where Expo deliberately disables automatic .env loading.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(mobileRoot, "../..");
// Refuse an SDK-wide OTA runtime, stale marketing version or missing new native
// modules BEFORE EAS touches Gradle, app signing credentials or provider APIs.
const preflight = spawnSync(process.execPath,
  [resolve(mobileRoot, "scripts/verify-native-release.mjs")],
  { cwd: mobileRoot, stdio: "inherit" });
if (preflight.error) throw preflight.error;
if (preflight.status !== 0) throw Error("MOBILE_NATIVE_RELEASE_PREFLIGHT_FAILED");
const required = [
  "EXPO_PUBLIC_TRACER_APP_TOKEN_ANDROID",
  "TRACER_PLUGIN_TOKEN_ANDROID",
  "EXPO_PUBLIC_TRACER_APP_TOKEN_IOS",
  "TRACER_PLUGIN_TOKEN_IOS",
];

let local = {};
try {
  local = parse(readFileSync(resolve(repoRoot, ".env")));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const env = { ...process.env };
// pnpm run exports npm_config_* workspace flags. They make nested npx treat
// apps/mobile/lib as an npm workspace, even though that directory does not exist.
for (const key of Object.keys(env)) {
  if (key.toLowerCase().startsWith("npm_config_") ||
      ["npm_execpath", "npm_lifecycle_event", "npm_lifecycle_script", "npm_package_json", "npm_package_name"].includes(key)) {
    delete env[key];
  }
}
for (const key of required) {
  const value = env[key]?.trim() || local[key]?.trim();
  if (!value) {
    throw new Error(`Missing ${key}: set it in your environment or in the ignored repo-root .env`);
  }
  env[key] = value;
}

const [mode, ...extraArgs] = process.argv.slice(2);
if (mode === "--verify-cli") {
  const result = spawnSync("npx", ["--yes", "eas-cli@27.4.1", "--version"], {
    cwd: mobileRoot,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
} else if (mode === "--verify-config") {
  const result = spawnSync(
    resolve(mobileRoot, "node_modules/expo/bin/cli"),
    ["config", "--json"],
    {
      cwd: mobileRoot,
      env: {
        ...env,
        APP_ENV: "production",
        EXPO_NO_DOTENV: "1",
        EXPO_PUBLIC_API_BASE_URL: "https://api.gafus.ru",
        EXPO_PUBLIC_CHAT2_API_ORIGIN: "https://api.gafus.ru",
      },
      encoding: "utf8",
      maxBuffer: 3_000_000,
    },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "Expo production config validation failed\n");
    process.exit(result.status || 1);
  }
  console.log("PASS: production Expo config resolves with AppTracer tokens");
} else {
  const forwarded = mode ? [mode, ...extraArgs] : [];
  const buildStartedAt = Date.now();
  const result = spawnSync(
    "npx",
    [
      "--yes",
      "eas-cli@27.4.1",
      "build",
      "--platform", "android",
      "--profile", "production-local",
      "--local",
      "--non-interactive",
      ...forwarded,
    ],
    { cwd: mobileRoot, env, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  // Validate the NEW AAB, not an older cached build. Google Play requires
  // 16KiB-capable ELF LOAD segments in 64-bit native libraries. Other checks
  // (bundletool ZIP alignment + device smoke) remain separate release gates.
  const explicit = forwarded.findIndex(arg => arg === "--output");
  const outputArgument = explicit >= 0 ? forwarded[explicit + 1] :
    forwarded.find(arg => arg.startsWith("--output="))?.slice("--output=".length);
  const candidates = outputArgument ? [resolve(mobileRoot, outputArgument)] :
    readdirSync(mobileRoot)
      .filter(name => name.endsWith(".aab"))
      .map(name => resolve(mobileRoot, name))
      .filter(path => statSync(path).mtimeMs >= buildStartedAt - 5000)
      .sort((left,right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  if (!candidates.length) {
    throw Error("MOBILE_NEW_AAB_NOT_FOUND: provide --output and verify a fresh AAB before store upload");
  }
  const verifyAab = spawnSync(process.execPath,
    [resolve(mobileRoot, "scripts/verify-android-aab-16k.mjs"), candidates[0]],
    { cwd: mobileRoot, stdio: "inherit" });
  if (verifyAab.error) throw verifyAab.error;
  if (verifyAab.status !== 0) throw Error("MOBILE_ANDROID_AAB_16KB_ELF_CHECK_FAILED");
  const verifyCompressor = spawnSync(process.execPath,
    [resolve(mobileRoot, "scripts/verify-android-aab-compressor.mjs"), candidates[0]],
    { cwd: mobileRoot, stdio: "inherit" });
  if (verifyCompressor.error) throw verifyCompressor.error;
  if (verifyCompressor.status !== 0) throw Error("MOBILE_ANDROID_NATIVE_COMPRESSOR_NOT_LINKED");
  const nativeLinks = spawnSync(process.execPath,
    [resolve(mobileRoot, "scripts/verify-android-aab-app-links.mjs"), candidates[0]],
    { cwd: mobileRoot, stdio: "inherit" });
  if (nativeLinks.error) throw nativeLinks.error;
  if (nativeLinks.status !== 0) throw Error("MOBILE_ANDROID_APP_LINKS_NOT_LINKED");
  const signingAssociation = spawnSync(process.execPath,
    [resolve(repoRoot, "scripts/qa/verify-gafus-app-links.mjs"), "--aab", candidates[0]],
    { cwd: repoRoot, stdio: "inherit" });
  if (signingAssociation.error) throw signingAssociation.error;
  if (signingAssociation.status !== 0) throw Error("MOBILE_ANDROID_ASSETLINKS_SIGNER_MISMATCH");
  console.log("MOBILE_STORE_ANDROID_NATIVE_AAB_VERIFIED");
}
