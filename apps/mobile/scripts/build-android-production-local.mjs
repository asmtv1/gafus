/** Local Android production build. Native release checks run before Gradle. */
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadRegisteredTarget } from "./native-release-target.mjs";
import {beginNativeDiagnosticCapture,endNativeDiagnosticCapture,finalizeNativeDiagnosticCapture} from "./native-store-diagnostic-archive.mjs";
const require = createRequire(import.meta.url);

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(mobileRoot, "../..");
// Refuse an SDK-wide OTA runtime, stale marketing version or missing new native
// modules BEFORE EAS touches Gradle, app signing credentials or provider APIs.
const preflight = spawnSync(process.execPath,
  [resolve(mobileRoot, "scripts/verify-native-release.mjs")],
  { cwd: mobileRoot, stdio: "inherit" });
if (preflight.error) throw preflight.error;
if (preflight.status !== 0) throw Error("MOBILE_NATIVE_RELEASE_PREFLIGHT_FAILED");
const env = { ...process.env, APP_ENV: "production", GAFUS_OTA_TRANSPORT: "self-hosted" };
// Homebrew JDK 17 is keg-only on macOS: /usr/bin/java may be a stub even
// when a valid JDK is installed. EAS local runs Gradle in a child process.
if (!env.JAVA_HOME && process.platform === "darwin") {
  for (const home of [
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
    "/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
  ]) {
    if (!existsSync(resolve(home, "bin/java"))) continue;
    env.JAVA_HOME = home;
    env.PATH = `${resolve(home, "bin")}:${env.PATH ?? ""}`;
    break;
  }
}
// pnpm run exports npm_config_* workspace flags. They make nested npx treat
// apps/mobile/lib as an npm workspace, even though that directory does not exist.
for (const key of Object.keys(env)) {
  if (key.toLowerCase().startsWith("npm_config_") ||
      ["npm_execpath", "npm_lifecycle_event", "npm_lifecycle_script", "npm_package_json", "npm_package_name"].includes(key)) {
    delete env[key];
  }
}
const [mode, ...extraArgs] = process.argv.slice(2);
let target;
if (mode !== "--verify-cli") {
  Object.assign(env, {
    GAFUS_OTA_TARGET_PLATFORM: "android",
    GAFUS_OTA_LOCAL_STORE_BUILD: "true",
    GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR: env.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR || ".ota-certs/android-store-native.json",
    GAFUS_OTA_NATIVE_CERTIFICATE: env.GAFUS_OTA_NATIVE_CERTIFICATE || ".ota-certs/native.pem",
    EXPO_PUBLIC_CHAT2_API_ORIGIN: "https://api.gafus.ru",
  });
  // The protected descriptor and certificate must exist before touching EAS.
  require("./self-hosted-native-profile.cjs").applyNativeSelfHostedProfile(
    require("../app.json").expo, { environment: env, appRoot: mobileRoot });
  if (mode !== "--verify-config") {
    const descriptor = JSON.parse(readFileSync(resolve(mobileRoot,env.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR),"utf8"));
    if (!["google-play", "rustore"].includes(descriptor.distribution)) throw Error("MOBILE_ANDROID_STORE_DISTRIBUTION_REQUIRED");
    target = loadRegisteredTarget({platform:"android",distribution:descriptor.distribution,env});
    Object.assign(env,target.buildEnv);
    if (mode === "--check") {
      console.log(JSON.stringify({state:"NATIVE_ANDROID_STORE_PREFLIGHT_PASS",distribution:target.distribution,
        appVersion:target.appVersion,buildNumber:target.buildNumber,nativeReleaseId:target.id}));
      process.exit(0);
    }
  }
}
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
  console.log("PASS: production Expo config validates without vendor tokens");
} else {
  const forwarded = mode ? [mode, ...extraArgs] : [];
  if (forwarded.some(arg => /^--(?:profile|platform)(?:=|$)/.test(arg))) throw Error("MOBILE_RELEASE_PROFILE_OVERRIDE_FORBIDDEN");
  if (!target) throw Error("MOBILE_ANDROID_STORE_TARGET_REQUIRED");
  const version = spawnSync("npx", ["--yes","eas-cli@27.4.1","build:version:get","--platform","android",
    "--profile","production-local","--json","--non-interactive"], {cwd:mobileRoot,env,encoding:"utf8",stdio:["ignore","pipe","inherit"]});
  if (version.error) throw version.error;
  if (version.status !== 0 || String(JSON.parse(version.stdout).versionCode) !== target.buildNumber)
    throw Error("MOBILE_ANDROID_STORE_REMOTE_BUILD_NUMBER_MISMATCH");
  const diagnosticCapture=beginNativeDiagnosticCapture(env);
  try {
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
    { cwd: mobileRoot, env:diagnosticCapture.env, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error("MOBILE_ANDROID_STORE_BUILD_FAILED");
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
  if (!candidates.length || !existsSync(candidates[0]) || statSync(candidates[0]).mtimeMs < buildStartedAt - 5000) {
    throw Error("MOBILE_NEW_AAB_NOT_FOUND: provide --output and verify a fresh AAB before store upload");
  }
  const ota = spawnSync("python3",
    [resolve(mobileRoot, "scripts/verify-native-ota-artifact.py"), candidates[0], "--descriptor", target.descriptorFile],
    { cwd: mobileRoot, stdio: "inherit" });
  if (ota.error) throw ota.error;
  if (ota.status !== 0) throw Error("MOBILE_ANDROID_AAB_OTA_CHECK_FAILED");
  const payment = spawnSync(process.execPath,
    [resolve(mobileRoot, "scripts/verify-android-payment-aab.mjs"), candidates[0]],
    { cwd: mobileRoot, stdio: "inherit" });
  if (payment.error) throw payment.error;
  if (payment.status !== 0) throw Error("MOBILE_ANDROID_AAB_PAYMENT_CHECK_FAILED");
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
  const diagnostics=finalizeNativeDiagnosticCapture(diagnosticCapture,candidates[0],target);
  console.log(JSON.stringify({state:"MOBILE_STORE_ANDROID_NATIVE_AAB_VERIFIED",diagnostics}));
  } finally { endNativeDiagnosticCapture(diagnosticCapture); }
}
