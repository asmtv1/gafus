/**
 * Protected CI callback: validate the exact signed Expo bytes, native trust,
 * asset inventory and idempotent operation before marking an OTA release READY.
 * No provider calls, S3 calls, or signing in the DB transaction.
 */
import crypto from "node:crypto";
import { prisma } from "@gafus/prisma";
import { z } from "zod/v3";

const UUID = z.string().uuid();
const SHA = z.string().regex(/^[a-f0-9]{40}$/i);
const HASH = z.string().regex(/^[a-f0-9]{64}$/i);
const ID = z.string().regex(/^[A-Za-z0-9_-]{16,120}$/);
const artifactSchema = z.object({
  key: z.string().min(1).max(256).regex(/^[a-f0-9]{64}\.[a-z0-9]{2,8}$/),
  immutableUrl: z.string().url().max(1024),
  sha256: HASH,
  mimeType: z.string().min(3).max(128),
  sizeBytes: z.number().int().positive().max(250_000_000),
  cdnVerified: z.literal(true),
  s3Verified: z.literal(true),
}).strict();
export const ciSignedReleaseSchema = z.object({
  operationId: ID,
  nativeReleaseId: UUID,
  updateId: UUID,
  sourceSha: SHA,
  revision: z.number().int().positive(),
  buildAttempt: z.number().int().positive().max(100),
  ciRunId: z.string().min(4).max(100),
  manifestBase64: z.string().min(10).max(1_400_000),
  signatureHeader: z.string().min(50).max(1024),
  artifacts: z.array(artifactSchema).min(1).max(10000),
  checks: z.object({
    unit: z.literal(true),
    mobileTypecheck: z.literal(true),
    nativeCompatibility: z.literal(true),
    iosPaymentGraph: z.boolean(),
    // Only audited, immutable source maps in the private S3 bucket qualify.
    privateSymbols: z.literal(true),
  }).strict(),
  symbolsRef: z.string().min(4).max(256),
}).strict();
export type SignedOtaCiResult = z.infer<typeof ciSignedReleaseSchema>;
export class MobileOtaCiError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export type NativeTrustRecord = {
  id: string;
  appId: string;
  platform: string;
  environment: string;
  channel: string;
  runtimeVersion: string;
  signingKeyId: string;
  nativeFingerprint: string;
  distribution?: string;
  embeddedUpdateId?: string | null;
  certificatePem: string | null;
  certificateSha256: string;
  verified: boolean;
};

const publicationSchema = z.object({
  title: z.string().trim().min(1).max(100),
  nativeReleaseId: UUID,
  nativeFingerprint: HASH,
  recoveryFor: z.number().int().positive().nullable(),
  allowsCheckout: z.boolean(),
}).strict();

export function validateSignedOtaCiResult(
  native: NativeTrustRecord,
  result: SignedOtaCiResult,
  cdnOrigin: string,
): { manifestBody: Buffer; createdAt: Date; signingExpiresAt: Date; publication: z.infer<typeof publicationSchema> | null } {
  if (!native.verified || !native.certificatePem || native.id !== result.nativeReleaseId ||
      native.platform !== "ios" && native.platform !== "android")
    throw new MobileOtaCiError("UNVERIFIED_NATIVE_RELEASE");
  if (result.checks.nativeCompatibility !== true || result.checks.unit !== true ||
      result.checks.mobileTypecheck !== true ||
      !(result.checks.privateSymbols === true &&
        /^symbols-s3:[a-f0-9]{64}$/.test(result.symbolsRef)) ||
      (native.platform === "ios" && !result.checks.iosPaymentGraph))
    throw new MobileOtaCiError("REQUIRED_CI_CHECK_MISSING");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(native.signingKeyId))
    throw new MobileOtaCiError("INVALID_SIGNING_ID");
  const matchingSignature = /^sig="([A-Za-z0-9+/=]+)",\s*keyid="([A-Za-z0-9_-]+)",\s*alg="rsa-v1_5-sha256"$/.exec(result.signatureHeader);
  if (!matchingSignature || matchingSignature[2] !== native.signingKeyId)
    throw new MobileOtaCiError("SIGNATURE_KEY_MISMATCH");
  if (crypto.createHash("sha256").update(native.certificatePem).digest("hex") !== native.certificateSha256)
    throw new MobileOtaCiError("CERTIFICATE_HASH_MISMATCH");
  let certificate: crypto.X509Certificate;
  try { certificate = new crypto.X509Certificate(native.certificatePem); }
  catch { throw new MobileOtaCiError("INVALID_NATIVE_CERTIFICATE"); }
  if (Date.parse(certificate.validFrom)>Date.now()) throw new MobileOtaCiError("CERTIFICATE_NOT_YET_VALID");
  if (Date.parse(certificate.validTo) <= Date.now()) throw new MobileOtaCiError("CERTIFICATE_EXPIRED");
  const manifestBody = Buffer.from(result.manifestBase64, "base64");
  if (manifestBody.length > 1_000_000 || manifestBody.toString("base64") !== result.manifestBase64)
    throw new MobileOtaCiError("INVALID_MANIFEST_BYTES");
  const signature = Buffer.from(matchingSignature[1], "base64");
  const signatureValid = crypto.verify("RSA-SHA256", manifestBody,
    { key: certificate.publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, signature);
  if (!signatureValid) throw new MobileOtaCiError("SIGNATURE_INVALID");
  let manifest: {
    id: string; createdAt: string; runtimeVersion: string;
    metadata?: Record<string,string>;
    extra?: { ota?: { revision?: number; publication?: unknown }; expoClient?: {extra?: {otaNativeReleaseId?: string; otaNativeFingerprint?: string}} };
    launchAsset?: { url?: string; hash?: string; contentType?: string };
    assets?: {url?: string;hash?: string;contentType?: string}[];
  };
  try { manifest = JSON.parse(manifestBody.toString("utf8")); }
  catch { throw new MobileOtaCiError("INVALID_MANIFEST_JSON"); }
  const createdAt = new Date(manifest.createdAt);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== manifest.createdAt ||
      manifest.id !== result.updateId || manifest.runtimeVersion !== native.runtimeVersion ||
      manifest.metadata?.channel !== native.channel ||
      manifest.metadata?.environment !== native.environment ||
      manifest.metadata?.sourceSha !== result.sourceSha ||
      manifest.extra?.ota?.revision !== result.revision ||
      !Array.isArray(manifest.assets))
    throw new MobileOtaCiError("MANIFEST_NATIVE_RUNTIME_MISMATCH");
  const raw = manifest.extra?.ota?.publication;
  const publication = raw === undefined ? null : publicationSchema.safeParse(raw);
  if (publication && (!publication.success ||
      publication.data.nativeReleaseId !== native.id ||
      publication.data.nativeFingerprint !== native.nativeFingerprint ||
      manifest.extra?.expoClient?.extra?.otaNativeReleaseId !== native.id ||
      manifest.extra?.expoClient?.extra?.otaNativeFingerprint !== native.nativeFingerprint ||
      (publication.data.recoveryFor !== null && (publication.data.recoveryFor >= result.revision || publication.data.allowsCheckout)) ||
      (publication.data.allowsCheckout && (native.distribution !== "internal" ||
        native.environment !== "production" || native.channel !== "production" ||
        !UUID.safeParse(native.embeddedUpdateId).success ||
        !/^\d+\.\d+\.\d+$/.test(native.runtimeVersion)))))
    throw new MobileOtaCiError("INVALID_SIGNED_PUBLICATION");
  const expectedAssets = [manifest.launchAsset, ...manifest.assets];
  if (expectedAssets.length !== result.artifacts.length)
    throw new MobileOtaCiError("MANIFEST_ASSET_COUNT_MISMATCH");
  const allowedOrigin = new URL(cdnOrigin);
  if (allowedOrigin.protocol !== "https:" || allowedOrigin.username || allowedOrigin.password ||
      allowedOrigin.search || allowedOrigin.hash)
    throw new MobileOtaCiError("UNTRUSTED_CDN_ORIGIN");
  // Direct Cloud.ru S3 public URLs contain a bucket pathname segment, e.g.
  // https://global.s3.cloud.ru/gafus-ota-updates/ota/preview/gafus/...
  // A CDN at the origin root is still supported for already issued releases.
  // Compare the *entire configured base pathname*, not only the hostname, so
  // a validly signed bundle cannot be redirected to another S3 bucket.
  const allowedBasePath = allowedOrigin.pathname.replace(/\/$/, "");
  // A signed Android bundle must never be registered as an iOS release (or
  // vice versa), even if both binaries happen to share a signing certificate.
  const nativeAssetPrefix = `${allowedBasePath}/ota/${native.environment}/gafus/${native.runtimeVersion}/${native.platform}/assets/`;
  const inventory = new Map(result.artifacts.map((item) => [item.immutableUrl, item]));
  if (inventory.size !== result.artifacts.length)
    throw new MobileOtaCiError("DUPLICATED_ARTIFACT_URL");
  for (const asset of expectedAssets) {
    const item = inventory.get(asset?.url ?? "");
    if (!item) throw new MobileOtaCiError("MISSING_SIGNED_ASSET");
    const url = new URL(item.immutableUrl);
    if (url.protocol !== "https:" || url.origin !== allowedOrigin.origin ||
        !url.pathname.startsWith(nativeAssetPrefix) ||
        !url.pathname.endsWith(`/${item.key}`) ||
        url.search || url.hash ||
        asset?.contentType !== item.mimeType ||
        asset?.hash !== Buffer.from(item.sha256,"hex").toString("base64url"))
      throw new MobileOtaCiError("INVALID_SIGNED_ASSET");
  }
  return { manifestBody, createdAt, signingExpiresAt:new Date(certificate.validTo), publication: publication?.data ?? null };
}

export type StoredOtaCiReplay = {
  id: string;
  nativeReleaseId: string;
  updateId: string;
  revision: number;
  sourceSha: string;
  signatureHeader: string;
  manifestBody: Uint8Array;
  symbolsRef: string;
  ciRunId: string;
  state: string;
  checks: SignedOtaCiResult["checks"];
};
export type StoredOtaArtifact = {
  assetKey: string;
  immutableUrl: string;
  sha256: string;
  mimeType: string;
  sizeBytes: bigint;
  verified: boolean;
};
/** GitHub reruns may change buildAttempt, but not signed identity or inventory. */
export function matchesStoredOtaCiReplay(
  old: StoredOtaCiReplay,
  artifacts: readonly StoredOtaArtifact[],
  requested: SignedOtaCiResult,
  signedBody: Uint8Array,
): boolean {
  if (old.nativeReleaseId !== requested.nativeReleaseId ||
      old.updateId !== requested.updateId ||
      old.revision !== requested.revision ||
      old.sourceSha !== requested.sourceSha ||
      old.signatureHeader !== requested.signatureHeader ||
      old.symbolsRef !== requested.symbolsRef ||
      old.ciRunId !== requested.ciRunId ||
      old.state !== "READY" ||
      !Buffer.from(old.manifestBody).equals(Buffer.from(signedBody))) return false;
  const canonicalChecks = (input: SignedOtaCiResult["checks"]) =>
    JSON.stringify(Object.entries(input).sort(([a],[b])=>a.localeCompare(b)));
  if (canonicalChecks(old.checks) !== canonicalChecks(requested.checks) ||
      artifacts.length !== requested.artifacts.length) return false;
  const byUrl = new Map(artifacts.map(item => [item.immutableUrl,item]));
  if (byUrl.size !== artifacts.length) return false;
  return requested.artifacts.every(input => {
    const previous = byUrl.get(input.immutableUrl);
    return !!previous && previous.verified && previous.assetKey === input.key &&
      previous.sha256 === input.sha256 && previous.mimeType === input.mimeType &&
      previous.sizeBytes === BigInt(input.sizeBytes);
  });
}

export async function registerVerifiedOtaCiResult(result: SignedOtaCiResult,
  cdnOrigin: string): Promise<{ releaseId: string; replayed: boolean }> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<NativeTrustRecord[]>`
      SELECT id, "appId", platform, environment, distribution, channel, "runtimeVersion", "signingKeyId",
        "nativeFingerprint", "certificatePem", "certificateSha256", verified, "embeddedUpdateId"
      FROM "MobileNativeRelease" WHERE id=${result.nativeReleaseId}::uuid FOR UPDATE
    `;
    if (!rows[0]) throw new MobileOtaCiError("NATIVE_RELEASE_NOT_FOUND");
    const native = rows[0];
    const verified = validateSignedOtaCiResult(native, result, cdnOrigin);
    const existing = await tx.$queryRaw<StoredOtaCiReplay[]>`
      SELECT id, "nativeReleaseId", "updateId", revision, "sourceSha", "signatureHeader",
        "manifestBody", "symbolsRef", "ciRunId", state, checks
      FROM "MobileOtaRelease" WHERE "operationId"=${result.operationId}
    `;
    if (existing[0]) {
      const row = existing[0];
      const savedAssets = await tx.$queryRaw<StoredOtaArtifact[]>`
        SELECT "assetKey", "immutableUrl", sha256, "mimeType", "sizeBytes", verified
        FROM "MobileOtaArtifact" WHERE "releaseId"=${row.id}::uuid
      `;
      if (!matchesStoredOtaCiReplay(row, savedAssets, result, verified.manifestBody))
        throw new MobileOtaCiError("OPERATION_REPLAY_CONFLICT");
      return { releaseId: row.id, replayed: true };
    }
    const releaseId = crypto.randomUUID();
    const checks = JSON.stringify(result.checks);
    await tx.$executeRaw`
      INSERT INTO "MobileOtaRelease"
        (id, "nativeReleaseId", "appId", platform, environment, channel, "runtimeVersion",
         "sourceSha", revision, "updateId", "manifestBody", "signatureHeader", "signingKeyId",
         state, checks, "symbolsRef", "operationId", "buildAttempt", "ciRunId", "createdAt", "readyAt", "signingExpiresAt", "releaseTitle", "recoveryFor", "allowsCheckout")
      VALUES (${releaseId}::uuid, ${native.id}::uuid, ${native.appId}, ${native.platform},
        ${native.environment}, ${native.channel}, ${native.runtimeVersion}, ${result.sourceSha},
        ${result.revision}, ${result.updateId}::uuid, ${verified.manifestBody},
        ${result.signatureHeader}, ${native.signingKeyId}, 'READY', ${checks}::jsonb,
        ${result.symbolsRef}, ${result.operationId}, ${result.buildAttempt}, ${result.ciRunId},
        ${verified.createdAt}, NOW(), ${verified.signingExpiresAt}, ${verified.publication?.title ?? null}, ${verified.publication?.recoveryFor ?? null}, ${verified.publication?.allowsCheckout ?? false})
    `;
    for (const item of result.artifacts) {
      await tx.$executeRaw`
        INSERT INTO "MobileOtaArtifact"
          (id, "releaseId", "assetKey", "immutableUrl", sha256, "mimeType", "sizeBytes", verified)
        VALUES (${crypto.randomUUID()}::uuid, ${releaseId}::uuid, ${item.key},
          ${item.immutableUrl}, ${item.sha256}, ${item.mimeType}, ${BigInt(item.sizeBytes)}, true)
      `;
    }
    return { releaseId, replayed: false };
  });
}
