/** Opt-in for a NEW native store/test binary; default EAS config stays unchanged. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ID = /^[a-zA-Z0-9_.-]{1,100}$/;
const SHA256 = /^[a-fA-F0-9]{64}$/;

function applyNativeSelfHostedProfile(config, { environment = process.env,
  appRoot = path.resolve(__dirname, "..") } = {}) {
  const mode = environment.GAFUS_OTA_TRANSPORT || "eas";
  if (mode === "eas") return config;
  if (mode !== "self-hosted") throw Error("UNSUPPORTED_GAFUS_OTA_TRANSPORT");
  const file = environment.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR;
  const certificatePath = environment.GAFUS_OTA_NATIVE_CERTIFICATE;
  if (!file || !certificatePath) throw Error("SELF_HOSTED_NATIVE_DESCRIPTOR_AND_CERT_REQUIRED");
  const descriptor = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!["preview", "production"].includes(descriptor.environment) ||
      !["ios", "android"].includes(descriptor.platform) ||
      !ID.test(descriptor.channel || "") || !ID.test(descriptor.runtimeVersion || "") ||
      !ID.test(descriptor.signingKeyId || "") || !SHA256.test(descriptor.certificateSha256 || "") ||
      !SHA256.test(descriptor.nativeFingerprint || ""))
    throw Error("SELF_HOSTED_NATIVE_DESCRIPTOR_INVALID");
  if (descriptor.environment === "production" &&
      (environment.CI !== "true" || environment.GAFUS_OTA_PRODUCTION_APPROVED !== "true"))
    throw Error("SELF_HOSTED_PRODUCTION_REQUIRES_APPROVED_CI");
  if (descriptor.appVersion !== config.version || config.runtimeVersion?.policy !== "appVersion")
    throw Error("SELF_HOSTED_NATIVE_APP_VERSION_RUNTIME_MISMATCH");
  if (!config.version || config.version === "1.7.4")
    throw Error("SELF_HOSTED_REQUIRES_NEW_NATIVE_APP_VERSION");
  if (descriptor.platform !== environment.GAFUS_OTA_TARGET_PLATFORM)
    throw Error("SELF_HOSTED_NATIVE_PLATFORM_MISMATCH");
  const certificate = path.resolve(appRoot,certificatePath);
  if (!certificate.startsWith(path.join(appRoot, ".ota-certs") + path.sep) ||
      !fs.existsSync(certificate))
    throw Error("SELF_HOSTED_CERTIFICATE_MUST_BE_IN_PROTECTED_NATIVE_DIRECTORY");
  const certificatePem = fs.readFileSync(certificate,"utf8");
  new crypto.X509Certificate(certificatePem);
  if (crypto.createHash("sha256").update(certificatePem).digest("hex") !== descriptor.certificateSha256)
    throw Error("SELF_HOSTED_CERTIFICATE_MISMATCH");
  const parsed = new URL(descriptor.updateUrl);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.search || parsed.hash || parsed.pathname !== "/ota/manifest" ||
      (descriptor.environment === "production" && parsed.hostname !== "gafus.ru") ||
      (descriptor.environment === "preview" && parsed.hostname === "gafus.ru"))
    throw Error("SELF_HOSTED_NATIVE_OTA_ENDPOINT_INVALID");
  return {
    ...config,
    updates: {
      ...config.updates,
      url: descriptor.updateUrl,
      codeSigningCertificate: `./.ota-certs/${path.basename(certificate)}`,
      codeSigningMetadata: { keyid: descriptor.signingKeyId, alg: "rsa-v1_5-sha256" },
      requestHeaders: { ...config.updates?.requestHeaders,
        "expo-channel-name": descriptor.channel,
        "x-gafus-native-fingerprint": descriptor.nativeFingerprint,
      },
      // Cohort header must be initialized from secure local storage BEFORE
      // the first update request. Never use native auto-check for partial rollout.
      checkAutomatically: "NEVER",
    },
    extra: { ...config.extra,
      otaTransport: "self-hosted",
      otaEnvironment: descriptor.environment,
      otaNativeReleaseId: descriptor.id,
      otaNativeFingerprint: descriptor.nativeFingerprint,
      otaChannel: descriptor.channel,
    },
  };
}
module.exports = { applyNativeSelfHostedProfile };
