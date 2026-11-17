/** Authoritative per-platform, per-native-runtime mandatory OTA policy (1.7.5+).
 * The old single MobileAppReleasePolicy OTA switch must never control SDK57 clients.
 */
import { prisma } from "@gafus/prisma";
import type { MandatoryOtaPolicy } from "./mandatory-policy.js";

export type OtaPlatform = "ios" | "android";
export type MandatoryControl = {
  platform: OtaPlatform; runtimeVersion: string; required: boolean;
  version: string | null; revision: number; updatedAt: Date;
};
export class MandatoryControlError extends Error {
  constructor(public readonly code: string) { super(code); }
}

/** An old native version must never be forced to use the 1.7.5+ signed OTA gate. */
export function supportsMandatoryOta(runtimeVersion: string): boolean {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(runtimeVersion);
  if (!match || match.slice(1).some(n => !Number.isSafeInteger(Number(n)))) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  return major > 1 || (major === 1 && (minor > 7 || (minor === 7 && patch >= 5)));
}

export function parseMandatoryVersion(runtimeVersion: string, version: string | null, required: boolean): number | null {
  if (!supportsMandatoryOta(runtimeVersion)) throw new MandatoryControlError("MANDATORY_RUNTIME_UNSUPPORTED");
  if (version === null) {
    if (required) throw new MandatoryControlError("MANDATORY_VERSION_REQUIRED");
    return null;
  }
  const match = /^(\d+\.\d+\.\d+)-ota\.([1-9]\d*)$/.exec(version);
  if (!match || match[1] !== runtimeVersion || !Number.isSafeInteger(Number(match[2])))
    throw new MandatoryControlError("MANDATORY_VERSION_RUNTIME_MISMATCH");
  return Number(match[2]);
}

export async function getMandatoryOtaControl(platform: OtaPlatform, runtimeVersion: string): Promise<MandatoryOtaPolicy | null> {
  if (!supportsMandatoryOta(runtimeVersion)) return null;
  const rows = await prisma.$queryRaw<{ required: boolean; version: string | null }[]>`
    SELECT required, version FROM "MobileOtaMandatoryPolicy"
    WHERE platform=${platform} AND "runtimeVersion"=${runtimeVersion}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return { required: rows[0].required, version: rows[0].version, platform, channel: "production" };
}

export async function listMandatoryOtaControls(): Promise<MandatoryControl[]> {
  return prisma.$queryRaw<MandatoryControl[]>`
    SELECT platform, "runtimeVersion", required, version, revision, "updatedAt"
    FROM "MobileOtaMandatoryPolicy" ORDER BY platform, "runtimeVersion"
  `;
}

export type UpdateMandatoryControl = {
  platform: OtaPlatform;
  runtimeVersion: string;
  required: boolean;
  version: string | null;
  expectedRevision: number; // 0 for new key, >=1 for compare-and-swap
  operationId: string;
  reason: string;
  actorId: string;
};

/** Admin-only atomic policy write; cannot enable a requirement without an actual
 * READY signed active deployment for that same platform and runtime.
 * 0% rollout remains safe because the authenticated decision uses exactly the
 * selected manifest revision per installation, not this flag by itself.
 */
export async function updateMandatoryOtaControl(input: UpdateMandatoryControl): Promise<MandatoryControl> {
  const wantedRevision = parseMandatoryVersion(input.runtimeVersion, input.version, input.required);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
      !/^[A-Za-z0-9_-]{16,120}$/.test(input.operationId) ||
      input.reason.trim().length < 8 || input.reason.length > 512)
    throw new MandatoryControlError("MANDATORY_COMMAND_INVALID");
  return prisma.$transaction(async tx => {
    const user = await tx.$queryRaw<{role:string}[]>`
      SELECT role FROM "User" WHERE id=${input.actorId} FOR UPDATE
    `;
    if (user[0]?.role !== "ADMIN") throw new MandatoryControlError("FORBIDDEN");
    const previous = await tx.$queryRaw<{operationId:string; platform:string;runtimeVersion:string;required:boolean;version:string|null;revision:number}[]>`
      SELECT "operationId",platform,"runtimeVersion",required,version,revision FROM "MobileOtaMandatoryPolicyAudit"
      WHERE "operationId"=${input.operationId} LIMIT 1
    `;
    if (previous[0]) {
      const item=previous[0];
      if (item.platform!==input.platform || item.runtimeVersion!==input.runtimeVersion || item.required!==input.required ||
          item.version!==input.version || item.revision!==input.expectedRevision+1)
        throw new MandatoryControlError("MANDATORY_OPERATION_CONFLICT");
      const saved=await tx.$queryRaw<MandatoryControl[]>`
        SELECT platform,"runtimeVersion",required,version,revision,"updatedAt" FROM "MobileOtaMandatoryPolicy"
        WHERE platform=${input.platform} AND "runtimeVersion"=${input.runtimeVersion}
      `;
      if (!saved[0] || saved[0].revision < item.revision) throw new MandatoryControlError("MANDATORY_STATE_CONFLICT");
      return saved[0];
    }
    if (input.required) {
      const publishable = await tx.$queryRaw<{id:string}[]>`
        SELECT d.id FROM "MobileOtaDeployment" d
        JOIN "MobileOtaRelease" r ON r.id=d."activeReleaseId"
        JOIN "MobileNativeRelease" n ON n.id=r."nativeReleaseId"
        WHERE d."appId"='gafus' AND d.environment='production' AND d.channel='production'
          AND d.platform=${input.platform} AND d."runtimeVersion"=${input.runtimeVersion}
          AND d.paused=false AND r.state='READY' AND r.revision >= ${wantedRevision!}
          AND n.verified=true AND n."nativeFingerprint"=d."nativeFingerprint"
          AND n."signingKeyId"=d."signingKeyId" AND n."runtimeVersion"=d."runtimeVersion"
          AND r."signingKeyId"=d."signingKeyId"
          AND NOT EXISTS (SELECT 1 FROM "MobileOtaArtifact" a WHERE a."releaseId"=r.id AND a.verified=false)
          AND EXISTS (SELECT 1 FROM "MobileOtaArtifact" a WHERE a."releaseId"=r.id)
        LIMIT 1
      `;
      if (!publishable[0]) throw new MandatoryControlError("MANDATORY_SIGNED_DEPLOYMENT_REQUIRED");
    }
    if (input.expectedRevision===0) {
      const inserted=await tx.$queryRaw<{platform:string}[]>`
        INSERT INTO "MobileOtaMandatoryPolicy" (platform,"runtimeVersion",required,version,revision,"updatedById")
        VALUES (${input.platform},${input.runtimeVersion},${input.required},${input.version},1,${input.actorId})
        ON CONFLICT DO NOTHING RETURNING platform
      `;
      if (!inserted[0]) throw new MandatoryControlError("MANDATORY_REVISION_CONFLICT");
    } else {
      const changed=await tx.$queryRaw<{revision:number}[]>`
        UPDATE "MobileOtaMandatoryPolicy"
        SET required=${input.required},version=${input.version}, revision=revision+1,
            "updatedById"=${input.actorId},"updatedAt"=CURRENT_TIMESTAMP
        WHERE platform=${input.platform} AND "runtimeVersion"=${input.runtimeVersion}
          AND revision=${input.expectedRevision}
        RETURNING revision
      `;
      if (!changed[0]) throw new MandatoryControlError("MANDATORY_REVISION_CONFLICT");
    }
    await tx.$executeRaw`
      INSERT INTO "MobileOtaMandatoryPolicyAudit"
      ("operationId",platform,"runtimeVersion","previousRevision",revision,required,version,"actorId",reason)
      VALUES (${input.operationId},${input.platform},${input.runtimeVersion},${input.expectedRevision},
        ${input.expectedRevision+1},${input.required},${input.version},${input.actorId},${input.reason.trim()})
    `;
    const result=await tx.$queryRaw<MandatoryControl[]>`
      SELECT platform,"runtimeVersion",required,version,revision,"updatedAt"
      FROM "MobileOtaMandatoryPolicy" WHERE platform=${input.platform} AND "runtimeVersion"=${input.runtimeVersion}
    `;
    if (!result[0]) throw new MandatoryControlError("MANDATORY_STATE_CONFLICT");
    return result[0];
  });
}
