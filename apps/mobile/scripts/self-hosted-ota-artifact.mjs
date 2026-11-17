/**
 * Offline Expo Protocol v1 preview artifact builder.
 * Caller supplies an Expo export plus the exact verified native release metadata
 * and CI-held RSA key. Does not upload, publish, or touch the shared source tree.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MIME = {
  js: "application/javascript", hbc: "application/javascript", json: "application/json",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", svg: "image/svg+xml", ttf: "font/ttf", otf: "font/otf",
  woff: "font/woff", woff2: "font/woff2", mp4: "video/mp4", m4a: "audio/mp4",
  mp3: "audio/mpeg", wav: "audio/wav", lottie: "application/json", xml: "application/xml",
  txt: "text/plain", db: "application/octet-stream", bin: "application/octet-stream",
};
const SHA = /^[a-f0-9]{40}$/i;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const ID = /^[A-Za-z0-9_.-]{1,100}$/;
function must(ok, reason) { if (!ok) throw new Error(reason); }
export function hashHex(buffer, algo = "sha256") {
  return crypto.createHash(algo).update(buffer).digest("hex");
}
function safeFile(root, relative) {
  must(typeof relative === "string" && relative.length > 0 && !path.isAbsolute(relative) &&
    !relative.includes("\\") && !relative.split("/").some((p) => !p || p === "." || p === ".."),
  "INVALID_EXPO_ASSET_PATH");
  const target = path.join(root, relative);
  const realRoot = fs.realpathSync(root);
  const realFile = fs.realpathSync(target);
  must(realFile.startsWith(realRoot + path.sep) && fs.statSync(realFile).isFile(), "ASSET_PATH_OUTSIDE_EXPORT");
  return realFile;
}
function requireMeta({ native, platform, environment, runtimeVersion, channel, sourceSha,
  signingKeyId, publicCdnBase, updateId, createdAt, revision, certificatePem, nativeFingerprint }) {
  must(environment === "preview" || environment === "production", "INVALID_OTA_ENVIRONMENT");
  must(platform === "ios" || platform === "android", "INVALID_OTA_PLATFORM");
  must(ID.test(runtimeVersion) && ID.test(channel) && ID.test(signingKeyId), "INVALID_OTA_TARGET");
  must(SHA.test(sourceSha) && UUID.test(updateId) && Number.isSafeInteger(revision) && revision > 0,
    "INVALID_SOURCE_RELEASE_METADATA");
  must(!Number.isNaN(Date.parse(createdAt)) && new Date(createdAt).toISOString() === createdAt,
    "INVALID_CREATED_AT");
  const cdn = new URL(publicCdnBase);
  must(cdn.protocol === "https:" && !cdn.username && !cdn.password && !cdn.search && !cdn.hash,
    "INSECURE_CDN_URL");
  must(native && native.verified === true && native.platform === platform &&
    native.environment === environment && native.channel === channel &&
    native.runtimeVersion === runtimeVersion && native.signingKeyId === signingKeyId &&
    SHA.test(native.sourceSha) && SHA256.test(nativeFingerprint) &&
    native.nativeFingerprint === nativeFingerprint && native.updateUrl?.startsWith("https://") &&
    new URL(native.updateUrl).pathname === "/ota/manifest" &&
    SHA256.test(native.certificateSha256) &&
    hashHex(Buffer.from(certificatePem)) === native.certificateSha256,
  "UNVERIFIED_NATIVE_RELEASE_OR_TRUST_MISMATCH");
}

export function buildSignedOtaArtifact({
  exportRoot, metadata, publicExpoConfig, native, platform, environment,
  runtimeVersion, channel, sourceSha, signingKeyId, publicCdnBase,
  updateId, createdAt, revision, certificatePem, privateKeyPem, nativeFingerprint,
}) {
  requireMeta({ native, platform, environment, runtimeVersion, channel,
    sourceSha, signingKeyId, publicCdnBase, updateId, createdAt, revision, certificatePem,
    nativeFingerprint });
  must(typeof publicExpoConfig === "object" && !!publicExpoConfig &&
    publicExpoConfig.version === native.appVersion, "EXPO_CONFIG_NATIVE_VERSION_MISMATCH");
  must(publicExpoConfig.updates?.url === native.updateUrl,
    "EXPO_CONFIG_NATIVE_ENDPOINT_MISMATCH");
  // expo-router requires a scheme in the OTA's embedded expoClient metadata.
  // Missing scheme is only discovered after the native download, as a JS fatal error.
  const schemes = Array.isArray(publicExpoConfig.scheme)
    ? publicExpoConfig.scheme : [publicExpoConfig.scheme];
  must(schemes.some(value => typeof value === "string" && value.trim()),
    "EXPO_CONFIG_SCHEME_REQUIRED");
  // iOS expo-updates rejects signatures from certificates without this EKU.
  const codeSigningUsage = new crypto.X509Certificate(certificatePem).keyUsage;
  must(codeSigningUsage?.includes("1.3.6.1.5.5.7.3.3"),
    "OTA_CERTIFICATE_CODE_SIGNING_EKU_REQUIRED");
  must(!Object.prototype.hasOwnProperty.call(publicExpoConfig, "privateKey") &&
    !Object.prototype.hasOwnProperty.call(publicExpoConfig, "credentials"), "EXPO_CONFIG_PRIVATE_CONTENT");
  must(metadata && metadata.bundler === "metro", "INVALID_EXPO_EXPORT_METADATA");
  const fileMetadata = metadata.fileMetadata?.[platform];
  must(fileMetadata && typeof fileMetadata.bundle === "string" && Array.isArray(fileMetadata.assets),
    "MISSING_PLATFORM_EXPORT");
  must(fileMetadata.assets.length <= 10_000, "ASSET_COUNT_EXCEEDED");
  const base = new URL(publicCdnBase.endsWith("/") ? publicCdnBase : `${publicCdnBase}/`);
  const assets = [];
  const inventory = [];
  const seenAssetPaths = new Set();
  let totalBytes = 0;
  function asset(filePath, extension, isLaunch) {
    must(!seenAssetPaths.has(filePath), "DUPLICATE_EXPO_ASSET_PATH");
    seenAssetPaths.add(filePath);
    const file = safeFile(exportRoot, filePath);
    const bytes = fs.readFileSync(file);
    must(bytes.length > 0 && bytes.length < 250_000_000, "INVALID_ASSET_SIZE");
    totalBytes += bytes.length;
    must(totalBytes < 2_000_000_000, "OTA_EXPORT_TOO_LARGE");
    const ext = (extension || path.extname(filePath).replace(/^\./, "")).replace(/^\./, "").toLowerCase();
    must(MIME[ext] && ext !== "map", "UNRECOGNIZED_ASSET_TYPE");
    const hash = hashHex(bytes);
    const sha256Base64url = crypto.createHash("sha256").update(bytes).digest("base64url");
    const key = hashHex(bytes, "md5");
    const immutableFile = `${hash}.${ext}`;
    const url = new URL(immutableFile, base).href;
    const record = {
      key, hash: sha256Base64url,
      contentType: MIME[ext],
      ...(!isLaunch ? { fileExtension: `.${ext}` } : {}),
      url,
    };
    inventory.push({ sourcePath: filePath, immutableFile, key, sha256: hash,
      contentType: MIME[ext], sizeBytes: bytes.length });
    return record;
  }
  const launchAsset = asset(fileMetadata.bundle, undefined, true);
  for (const value of fileMetadata.assets) {
    must(value && typeof value.path === "string" && typeof value.ext === "string",
      "INVALID_EXPO_ASSET_METADATA");
    assets.push(asset(value.path, value.ext, false));
  }
  const manifest = {
    id: updateId,
    createdAt,
    runtimeVersion,
    launchAsset,
    assets,
    metadata: { channel, environment, sourceSha },
    extra: { expoClient: publicExpoConfig, ota: { revision } },
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  // RSA-PKCS1v1.5 with SHA-256 matches expo-updates codeSigningMetadata.
  const signature = crypto.sign("RSA-SHA256", manifestBytes, {
    key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_PADDING,
  });
  const verified = crypto.verify("RSA-SHA256", manifestBytes,
    { key: certificatePem, padding: crypto.constants.RSA_PKCS1_PADDING }, signature);
  must(verified, "SIGNATURE_CERTIFICATE_MISMATCH");
  return {
    manifest,
    manifestBytes,
    signatureHeader: `sig="${signature.toString("base64")}", keyid="${signingKeyId}", alg="rsa-v1_5-sha256"`,
    inventory,
    signingKeyId,
    sourceSha,
    platform,
    environment,
    runtimeVersion,
    channel,
    revision,
    updateId,
    nativeReleaseId: native.id,
  };
}

export function verifyAndWriteLocalPreview({ artifact, exportRoot, outputDir }) {
  const root = path.resolve(outputDir);
  must(!fs.existsSync(root) || fs.readdirSync(root).length === 0, "OTA_OUTPUT_MUST_BE_EMPTY");
  fs.mkdirSync(path.join(root, "assets"), { recursive: true, mode: 0o700 });
  for (const info of artifact.inventory) {
    const original = fs.readFileSync(safeFile(exportRoot, info.sourcePath));
    must(hashHex(original) === info.sha256, "ASSET_CHANGED_SINCE_SIGNING");
    const output = path.join(root, "assets", info.immutableFile);
    if (fs.existsSync(output)) {
      must(hashHex(fs.readFileSync(output)) === info.sha256, "ASSET_HASH_COLLISION");
      continue;
    }
    fs.writeFileSync(output, original, { mode: 0o600, flag: "wx" });
  }
  fs.writeFileSync(path.join(root, "manifest.json"), artifact.manifestBytes, { mode: 0o600, flag: "wx" });
  const { manifestBytes: ignoredBytes, manifest, ...safeSummary } = artifact;
  void ignoredBytes;
  fs.writeFileSync(path.join(root, "release-metadata.json"), JSON.stringify({
    ...safeSummary,
    inventory: artifact.inventory,
    manifestSha256: hashHex(artifact.manifestBytes),
    manifestId: manifest.id,
    // Only detached signature header; never include the private key.
  }, null, 2), { mode: 0o600, flag: "wx" });
  return root;
}
