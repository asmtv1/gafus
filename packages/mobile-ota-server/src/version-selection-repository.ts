// SQL-only read/write adapter for OTA installation observation and release selection.
import { prisma } from "@gafus/prisma";
import type { Context, Choice } from "./version-selection.js";

export async function hasVersionPublication(c: Context): Promise<boolean> {
  const [scope] = await prisma.$queryRaw<{sequence: number}[]>`SELECT sequence FROM "MobileOtaPublication"
    WHERE platform=${c.platform} AND "runtimeVersion"=${c.runtimeVersion} ORDER BY sequence DESC LIMIT 1`;
  return !!scope;
}
export async function recordVersionObservation(c: Context, identity: string, embedded: string, running: string | null) {
  await prisma.$executeRaw`INSERT INTO "MobileOtaInstallationObservation" (identity,"nativeReleaseId","currentUpdateId")
      SELECT ${identity},n.id,${running}::uuid FROM "MobileNativeRelease" n WHERE n."embeddedUpdateId"=${embedded}::uuid
        AND n."appId"='gafus' AND n.platform=${c.platform} AND n."runtimeVersion"=${c.runtimeVersion}
        AND n."appVersion"=n."runtimeVersion" AND n.environment='production' AND n.channel='production' AND n.verified
        AND n."nativeFingerprint"=${c.nativeFingerprint} AND n."signingKeyId"=${c.keyId ?? null}
        AND NOT EXISTS (SELECT 1 FROM "MobileNativeRelease" other WHERE other.id<>n.id AND other."embeddedUpdateId"=n."embeddedUpdateId"
          AND other."appId"=n."appId" AND other.platform=n.platform AND other.environment=n.environment AND other.channel=n.channel
          AND other."runtimeVersion"=n."runtimeVersion" AND other."nativeFingerprint"=n."nativeFingerprint" AND other."signingKeyId"=n."signingKeyId")
      ON CONFLICT(identity) DO UPDATE SET "currentUpdateId"=excluded."currentUpdateId","observedAt"=now()
        WHERE "MobileOtaInstallationObservation"."nativeReleaseId"=excluded."nativeReleaseId"`;
}
export async function readVersionCandidate(c: Context, source: "manifest" | "policy", tester: boolean, identity: string | null, embedded: string | null): Promise<(Partial<Choice> & {matched: boolean}) | undefined> {
  const [row] = await prisma.$queryRaw<(Partial<Choice> & { matched: boolean })[]>`
    SELECT r.id IS NOT NULL AS matched,r."manifestBody",r."signatureHeader",r."updateId",r.revision,p.required,
       r."allowsCheckout" AND (p.platform<>'android' OR (p.action='TEST' AND NOT p.public AND ${tester})) AND p.action<>'STOP' AND latest.action<>'STOP' AND r.distribution='internal' AS "allowsCheckout",
       r.running FROM (SELECT * FROM "MobileOtaPublication" WHERE platform=${c.platform}
         AND "runtimeVersion"=${c.runtimeVersion} AND (public OR ${tester}) ORDER BY sequence DESC LIMIT 1) p
    JOIN LATERAL (SELECT action FROM "MobileOtaPublication" WHERE platform=p.platform AND "runtimeVersion"=p."runtimeVersion"
      ORDER BY sequence DESC LIMIT 1) latest ON true
    LEFT JOIN LATERAL (
      SELECT rel.*,n.distribution,obs."currentUpdateId"=rel."updateId" AS running FROM "MobileOtaRelease" rel
      JOIN "MobileNativeRelease" n ON n.id=rel."nativeReleaseId"
      LEFT JOIN "MobileOtaInstallationObservation" obs ON obs.identity=${identity} AND obs."nativeReleaseId"=n.id
        AND obs."observedAt">now()-interval '1 day'
      WHERE p.action<>'STOP' AND rel.id=ANY(p."releaseIds") AND rel.revision=p.revision AND rel."releaseTitle"=p.title
        AND rel.state='READY' AND rel."signingExpiresAt">now() AND rel."appId"='gafus' AND rel.platform=p.platform AND rel."runtimeVersion"=p."runtimeVersion"
        AND rel.channel='production' AND rel.environment='production' AND n.verified AND n."appId"=rel."appId"
        AND n.platform=rel.platform AND n."runtimeVersion"=rel."runtimeVersion" AND n."appVersion"=n."runtimeVersion"
        AND n.channel=rel.channel AND n.environment=rel.environment AND n."signingKeyId"=rel."signingKeyId"
        AND n."nativeFingerprint"=${c.nativeFingerprint} AND n."embeddedUpdateId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "MobileNativeRelease" other WHERE other.id<>n.id AND other."embeddedUpdateId"=n."embeddedUpdateId"
          AND other."appId"=n."appId" AND other.platform=n.platform AND other.environment=n.environment AND other.channel=n.channel
          AND other."runtimeVersion"=n."runtimeVersion" AND other."nativeFingerprint"=n."nativeFingerprint" AND other."signingKeyId"=n."signingKeyId")
        AND CASE WHEN ${source === "manifest"} THEN n."embeddedUpdateId"=${embedded}::uuid AND n."signingKeyId"=${c.keyId ?? null}
          WHEN ${c.nativeReleaseId ?? null}::uuid IS NOT NULL THEN n.id=${c.nativeReleaseId ?? null}::uuid ELSE obs.identity IS NOT NULL END
        AND EXISTS (SELECT 1 FROM "MobileOtaArtifact" a WHERE a."releaseId"=rel.id)
        AND NOT EXISTS (SELECT 1 FROM "MobileOtaArtifact" a WHERE a."releaseId"=rel.id AND NOT a.verified)
    ) r ON true`;
  return row;
}
