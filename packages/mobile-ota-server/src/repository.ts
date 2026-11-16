/** Read-only SQL adapter. Reads only READY, artifact-verified immutable updates. */
import { prisma } from "@gafus/prisma";
import type { OtaLookup, OtaManifestRepository, OtaManifestRow } from "./contracts.js";
import { otaRolloutIncludesInstallation } from "./rollout-policy.js";

export const mobileOtaManifestRepository: OtaManifestRepository = {
  async findPublishedManifest(key: OtaLookup): Promise<OtaManifestRow | null> {
    const rows = await prisma.$queryRaw<{
      manifestBody: Uint8Array;
      signatureHeader: string;
      updateId: string;
      deploymentId: string;
      rolloutPercent: number;
      releaseKind: "active" | "previous";
    }[]>`
      SELECT r."manifestBody", r."signatureHeader", r."updateId",
        d.id AS "deploymentId", d."rolloutPercent",
        CASE WHEN r.id = d."activeReleaseId" THEN 'active' ELSE 'previous' END AS "releaseKind"
      FROM "MobileOtaDeployment" AS d
      JOIN "MobileOtaRelease" AS r ON r.id IN (d."activeReleaseId", d."previousReleaseId")
      JOIN "MobileNativeRelease" AS n ON n.id = r."nativeReleaseId"
      WHERE d."appId" = ${key.appId}
        AND d."environment" = ${key.environment}
        AND d.platform = ${key.platform}
        AND d.channel = ${key.channel}
        AND d."runtimeVersion" = ${key.runtimeVersion}
        AND d."signingKeyId" = ${key.keyId}
        AND d."nativeFingerprint" = ${key.nativeFingerprint}
        AND d.paused = false
        AND d."rolloutPercent" BETWEEN 0 AND 100
        AND r.state = 'READY'
        AND r."signingKeyId" = d."signingKeyId"
        AND r."runtimeVersion" = d."runtimeVersion"
        AND r.platform = d.platform
        AND r.environment = d.environment
        AND r.channel = d.channel
        AND r."appId" = d."appId"
        AND n.verified = true
        AND n."runtimeVersion" = d."runtimeVersion"
        AND n."signingKeyId" = d."signingKeyId"
        AND n."nativeFingerprint" = d."nativeFingerprint"
        AND n."environment" = d.environment
        AND n.platform = d.platform
        AND NOT EXISTS (
          SELECT 1 FROM "MobileOtaArtifact" a
          WHERE a."releaseId" = r.id AND a.verified = false
        )
        AND EXISTS (
          SELECT 1 FROM "MobileOtaArtifact" a WHERE a."releaseId" = r.id
        )
      ORDER BY CASE WHEN r.id = d."activeReleaseId" THEN 0 ELSE 1 END
      LIMIT 2
    `;
    const first = rows[0];
    if (!first) return null;
    const included = otaRolloutIncludesInstallation(first.deploymentId, key.installationId ?? null,
      first.rolloutPercent, key.testerAllowed === true);
    const selected = rows.find(row => row.releaseKind === (included ? "active" : "previous"));
    if (!selected) return null;
    return { manifestBody: selected.manifestBody, signatureHeader: selected.signatureHeader, updateId: selected.updateId };
  },
};
