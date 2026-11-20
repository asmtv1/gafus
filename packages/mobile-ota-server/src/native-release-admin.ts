/** Owner-scoped admin creation and auditable verification of a native OTA runtime. */
import { createHash, randomUUID, X509Certificate } from "node:crypto";
import { z } from "zod/v3";
import { prisma } from "@gafus/prisma";

const UUID = z.string().uuid();
const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const SOURCE_SHA = z.string().regex(/^[a-f0-9]{40}$/);
export const nativeReleaseInput = z.object({
  operationId: z.string().regex(/^[A-Za-z0-9_-]{16,120}$/),
  platform: z.enum(["ios","android"]),
  environment: z.enum(["preview","production"]),
  distribution: z.enum(["internal","testflight","app-store","google-play","rustore"]),
  bundleId: z.literal("ru.gafus.app"),
  appVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  buildNumber: z.string().regex(/^\d{1,20}$/),
  runtimeVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  channel: z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/),
  updateUrl: z.string().url().max(512),
  signingKeyId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  certificatePem: z.string().min(128).max(10_000),
  nativeFingerprint: SHA256,
  sourceSha: SOURCE_SHA,
  embeddedUpdateId: UUID.optional(),
  provenance: z.object({
    ciRunId: z.string().min(2).max(100),
    // The native release ID must be allocated before embedding it in an IPA/APK.
    // A pre-build candidate has no binary hash yet; binding happens at verification.
    nativeArtifactSha256: SHA256.optional(),
    buildLogRef: z.string().min(2).max(256),
  }).strict(),
}).strict();
export const verifyNativeInput = z.object({
  operationId: z.string().regex(/^[A-Za-z0-9_-]{16,120}$/),
  action: z.enum(["VERIFY","REVOKE"]),
  reason: z.string().trim().min(16).max(512),
  evidence: z.object({
    nativeArtifactSha256: SHA256,
    nativeReleaseId: UUID.optional(),
    embeddedUpdateId: UUID.optional(),
    physicalDeviceVerified: z.boolean(),
    distributionVerified: z.boolean(),
    reference: z.string().min(4).max(256),
  }).strict(),
}).strict();
export type NativeReleaseInput = z.infer<typeof nativeReleaseInput>;
export type VerifyNativeInput = z.infer<typeof verifyNativeInput>;

export class MobileOtaNativeError extends Error {
  constructor(public readonly code: string) { super(code); }
}
function sha256(text: string) { return createHash("sha256").update(text).digest("hex"); }
export function assertNativeReleaseCandidate(input: NativeReleaseInput): string {
  const [major,minor,patch] = input.appVersion.split(".").map(Number);
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch) ||
      major*1_000_000 + minor*1_000 + patch <= 1_007_004 ||
      input.runtimeVersion !== input.appVersion)
    throw new MobileOtaNativeError("NEW_NATIVE_RUNTIME_REQUIRED");
  if (input.environment === "production" && input.channel !== "production")
    throw new MobileOtaNativeError("OTA_CHANNEL_ENV_MISMATCH");
  if (input.environment === "preview" && input.channel === "production")
    throw new MobileOtaNativeError("OTA_CHANNEL_ENV_MISMATCH");
  const url = new URL(input.updateUrl);
  if (url.protocol !== "https:" || url.pathname !== "/ota/manifest" ||
      url.username || url.password || url.search || url.hash ||
      (input.environment === "production" && url.hostname !== "gafus.ru") ||
      (input.environment === "preview" && url.hostname === "gafus.ru"))
    throw new MobileOtaNativeError("UNTRUSTED_NATIVE_OTA_ENDPOINT");
  let cert: X509Certificate;
  try { cert = new X509Certificate(input.certificatePem); }
  catch { throw new MobileOtaNativeError("INVALID_NATIVE_SIGNING_CERTIFICATE"); }
  if (Date.parse(cert.validTo) <= Date.now())
    throw new MobileOtaNativeError("NATIVE_CERTIFICATE_EXPIRED");
  if (input.distribution === "app-store" && input.platform !== "ios" ||
      input.distribution === "testflight" && input.platform !== "ios" ||
      ["google-play","rustore"].includes(input.distribution) && input.platform !== "android")
    throw new MobileOtaNativeError("NATIVE_DISTRIBUTION_PLATFORM_MISMATCH");
  return sha256(input.certificatePem);
}

export async function registerNativeCandidate(input: NativeReleaseInput, actorId: string) {
  const certificateSha256 = assertNativeReleaseCandidate(input);
  const inputSha256 = sha256(JSON.stringify(input));
  return prisma.$transaction(async (tx) => {
    const audits = await tx.$queryRaw<{ nativeReleaseId:string; evidence: {inputSha256:string} }[]>`
      SELECT "nativeReleaseId", evidence FROM "MobileNativeReleaseAuditEvent"
      WHERE "operationId"=${input.operationId}
    `;
    if (audits[0]) {
      if (audits[0].evidence.inputSha256 !== inputSha256)
        throw new MobileOtaNativeError("NATIVE_OPERATION_CONFLICT");
      return {nativeReleaseId:audits[0].nativeReleaseId,replayed:true};
    }
    const id = randomUUID();
    const provenance = JSON.stringify(input.provenance);
    const created = await tx.$queryRaw<{id:string}[]>`
      INSERT INTO "MobileNativeRelease"
        (id,"appId",platform,environment,distribution,"bundleId","appVersion","buildNumber",
         "runtimeVersion",channel,"updateUrl","signingKeyId","certificateSha256","certificatePem",
         "nativeFingerprint","sourceSha","embeddedUpdateId",verified,attestation)
      VALUES (${id}::uuid,'gafus',${input.platform},${input.environment},${input.distribution},
        ${input.bundleId},${input.appVersion},${input.buildNumber},${input.runtimeVersion},
        ${input.channel},${input.updateUrl},${input.signingKeyId},${certificateSha256},
        ${input.certificatePem},${input.nativeFingerprint},${input.sourceSha},
        ${input.embeddedUpdateId ?? null}::uuid,false,${provenance}::jsonb)
      ON CONFLICT ("appId",platform,environment,distribution,"buildNumber") DO NOTHING
      RETURNING id
    `;
    if (!created[0]) throw new MobileOtaNativeError("NATIVE_BUILD_ALREADY_REGISTERED");
    const evidence = JSON.stringify({inputSha256,...input.provenance});
    await tx.$executeRaw`
      INSERT INTO "MobileNativeReleaseAuditEvent"
        (id,"nativeReleaseId","operationId",action,"actorId",evidence)
      VALUES (${randomUUID()}::uuid,${id}::uuid,${input.operationId},'REGISTER',${actorId},${evidence}::jsonb)
    `;
    return {nativeReleaseId:id,replayed:false};
  });
}

export async function verifyNativeCandidate(id: string, input: VerifyNativeInput, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{
      id:string;verified:boolean;embeddedUpdateId:string|null;attestation:{nativeArtifactSha256:string};
    }[]>`
      SELECT id,verified,"embeddedUpdateId",attestation FROM "MobileNativeRelease" WHERE id=${id}::uuid FOR UPDATE
    `;
    if (!rows[0]) throw new MobileOtaNativeError("NATIVE_RELEASE_NOT_FOUND");
    const previous = await tx.$queryRaw<{id:string;action:string;evidence:{inputSha256:string}}[]>`
      SELECT id,action,evidence FROM "MobileNativeReleaseAuditEvent"
      WHERE "operationId"=${input.operationId} AND "nativeReleaseId"=${id}::uuid
    `;
    if(input.evidence.nativeReleaseId && input.evidence.nativeReleaseId!==id) throw new MobileOtaNativeError("NATIVE_ARTIFACT_PROOF_MISMATCH");
    const proofSha = sha256(JSON.stringify(input));
    if (previous[0]) {
      if (previous[0].evidence.inputSha256 !== proofSha || previous[0].action !== input.action)
        throw new MobileOtaNativeError("NATIVE_OPERATION_CONFLICT");
      return {nativeReleaseId:id,verified:input.action === "VERIFY",replayed:true};
    }
    const backfill=input.action==="VERIFY" && !rows[0].embeddedUpdateId && !!input.evidence.embeddedUpdateId;
    if (rows[0].embeddedUpdateId && input.evidence.embeddedUpdateId && rows[0].embeddedUpdateId!==input.evidence.embeddedUpdateId)
      throw new MobileOtaNativeError("NATIVE_ARTIFACT_PROOF_MISMATCH");
    if ((input.action === "VERIFY") === rows[0].verified && !backfill)
      throw new MobileOtaNativeError("NATIVE_VERIFICATION_STATE_CONFLICT");
    const registeredHash=rows[0].attestation.nativeArtifactSha256;
    if (registeredHash && registeredHash !== input.evidence.nativeArtifactSha256)
      throw new MobileOtaNativeError("NATIVE_ARTIFACT_PROOF_MISMATCH");
    if (input.action === "VERIFY" &&
        (!input.evidence.physicalDeviceVerified || !input.evidence.distributionVerified))
      throw new MobileOtaNativeError("NATIVE_DEVICE_AND_DISTRIBUTION_PROOF_REQUIRED");
    // Atomically bind the actual built artifact SHA only after physical-device
    // and distribution evidence. A pending candidate is never deliverable.
    await tx.$executeRaw`
      UPDATE "MobileNativeRelease" SET verified=${input.action === "VERIFY"},
        "embeddedUpdateId"=COALESCE("embeddedUpdateId",${input.action==="VERIFY" ? input.evidence.embeddedUpdateId??null : null}::uuid),
        "verifiedAt"=${input.action === "VERIFY" ? new Date() : null},
        attestation=CASE
          WHEN ${input.action === "VERIFY"} AND NOT (attestation ? 'nativeArtifactSha256')
          THEN jsonb_set(attestation,'{nativeArtifactSha256}',
            to_jsonb(${input.evidence.nativeArtifactSha256}::text),true)
          ELSE attestation END
      WHERE id=${id}::uuid
    `;
    const evidence=JSON.stringify({inputSha256:proofSha,reason:input.reason,...input.evidence});
    await tx.$executeRaw`
      INSERT INTO "MobileNativeReleaseAuditEvent"
        (id,"nativeReleaseId","operationId",action,"actorId",evidence)
      VALUES (${randomUUID()}::uuid,${id}::uuid,${input.operationId},${input.action},${actorId},${evidence}::jsonb)
    `;
    return {nativeReleaseId:id,verified:input.action === "VERIFY",replayed:false};
  });
}
