/** SQL-only adapter: OTA list/read operations do not belong to Hono routes. */
import { prisma } from "@gafus/prisma";

export async function listNativeOtaAudit(): Promise<unknown[]> {
  return prisma.$queryRaw<unknown[]>`
      SELECT a.id, a.action, a."operationId", a."actorId", a.evidence, a."createdAt",
        n.platform, n.environment, n.channel, n."runtimeVersion", n."appVersion", n."buildNumber"
      FROM "MobileNativeReleaseAuditEvent" a
      JOIN "MobileNativeRelease" n ON n.id=a."nativeReleaseId"
      ORDER BY a."createdAt" DESC LIMIT 100
    `;
}

export async function listNativeOtaReleases(): Promise<unknown[]> {
  return prisma.$queryRaw<unknown[]>`
      SELECT id, "appId", platform, environment, distribution, "bundleId", "appVersion",
        "buildNumber", "runtimeVersion", channel, "signingKeyId", "certificateSha256",
        "nativeFingerprint", "sourceSha", "embeddedUpdateId", verified, "verifiedAt", "createdAt", attestation
      FROM "MobileNativeRelease" ORDER BY "createdAt" DESC LIMIT 100
    `;
}

export async function listMobileOtaReleases(): Promise<unknown[]> {
  return prisma.$queryRaw<unknown[]>`
      SELECT r.id, r.platform, r.environment, r.channel, r."runtimeVersion", r."sourceSha",
        r.revision, r."updateId", r.state, r."signingKeyId", n."nativeFingerprint", r."symbolsRef",
        r."createdAt", r."readyAt",
        COUNT(a.id)::int AS "assetCount", COALESCE(SUM(a."sizeBytes"), 0)::text AS "totalBytes",
        COALESCE(BOOL_AND(a.verified), false) AS "assetsVerified"
      FROM "MobileOtaRelease" AS r
      JOIN "MobileNativeRelease" AS n ON n.id = r."nativeReleaseId"
      LEFT JOIN "MobileOtaArtifact" AS a ON a."releaseId" = r.id
      GROUP BY r.id, n."nativeFingerprint" ORDER BY r."createdAt" DESC LIMIT 100
    `;
}

export async function listMobileOtaPatchDefinitions(): Promise<unknown[]> {
  return prisma.$queryRaw<unknown[]>`
      SELECT id, version, sha256, "allowedBases", "nativeRequirements", "createdAt"
      FROM "MobilePatchDefinition" ORDER BY "createdAt" DESC LIMIT 100
    `;
}

export async function listMobileOtaAudit(): Promise<unknown[]> {
  return prisma.$queryRaw<unknown[]>`
      SELECT a.id, a.action, a."operationId", a."actorId", a.reason,
        a."expectedVersion", a."resultingVersion", a."releaseId", a."createdAt",
        d.platform, d.environment, d.channel, d."runtimeVersion"
      FROM "MobileOtaAuditEvent" a
      JOIN "MobileOtaDeployment" d ON d.id = a."deploymentId"
      ORDER BY a."createdAt" DESC LIMIT 100
    `;
}

export type CiNativeDescriptor = {
  id: string; appId: string; platform: string; environment: string;
  distribution: string; bundleId: string; appVersion: string; buildNumber: string;
  runtimeVersion: string; channel: string; updateUrl: string; signingKeyId: string;
  certificateSha256: string; certificatePem: string | null;
  nativeFingerprint: string; sourceSha: string; verified: boolean;
};
export async function getNativeOtaDescriptorForCi(id: string): Promise<CiNativeDescriptor | null> {
  const rows = await prisma.$queryRaw<CiNativeDescriptor[]>`
    SELECT id, "appId", platform, environment, distribution, "bundleId", "appVersion",
        "buildNumber", "runtimeVersion", channel, "updateUrl", "signingKeyId", "certificateSha256",
        "certificatePem", "nativeFingerprint", "sourceSha", verified
      FROM "MobileNativeRelease" WHERE id=${id}::uuid
  `;
  return rows[0] ?? null;
}
