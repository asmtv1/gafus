/** Atomic OTA deployment transitions. No build/sign/network calls inside SQL transactions. */
import { randomUUID } from "node:crypto";
import { prisma } from "@gafus/prisma";
import {versionOwnsScope} from "./version-publication.js";
import { validOtaPercent } from "./rollout-policy.js";

type Deployment = {
  id: string;
  appId: string;
  platform: string;
  environment: string;
  channel: string;
  runtimeVersion: string;
  signingKeyId: string;
  nativeFingerprint: string;
  activeReleaseId: string | null;
  previousReleaseId: string | null;
  rowVersion: number;
  paused: boolean;
  rolloutPercent: number;
};
type Release = { id: string; createdAt: Date; verified: boolean };
type Audit = {
  deploymentId: string;
  action: string;
  actorId: string;
  reason: string;
  expectedVersion: number;
  resultingVersion: number;
  releaseId: string | null;
  rolloutPercent: number | null;
};
export class MobileOtaDeploymentError extends Error {
  constructor(public readonly code: "VERSION_PUBLICATION_MANAGED" | "NOT_FOUND" | "STALE_VERSION" | "OPERATION_CONFLICT" | "UNVERIFIED_RELEASE" | "ROLLBACK_REQUIRES_NEW_UPDATE" | "DEPLOYMENT_ALREADY_EXISTS" | "INVALID_ROLLOUT" | "ROLLOUT_MUST_INCREASE", message = code) {
    super(message);
  }
}

export async function listMobileOtaDeployments(): Promise<Deployment[]> {
  return prisma.$queryRaw<Deployment[]>`
    SELECT id, "appId", platform, environment, channel, "runtimeVersion", "signingKeyId", "nativeFingerprint",
      "activeReleaseId", "previousReleaseId", "rowVersion", paused, "rolloutPercent"
    FROM "MobileOtaDeployment" ORDER BY "updatedAt" DESC LIMIT 100
  `;
}

/**
 * Create an explicit, PAUSED deployment for a separately verified native binary.
 * This is never a publish, and cannot activate rollout accidentally.
 */
export async function createMobileOtaDeployment(input: {
  nativeReleaseId: string;
  actorId: string;
  operationId: string;
  reason: string;
}): Promise<{ id: string; version: number; paused: boolean; replayed: boolean }> {
  return prisma.$transaction(async (tx) => {
    const natives = await tx.$queryRaw<{
      id: string; appId: string; platform: string; environment: string;
      channel: string; runtimeVersion: string; signingKeyId: string;
      nativeFingerprint: string; verified: boolean;
    }[]>`
      SELECT id, "appId", platform, environment, channel, "runtimeVersion", "signingKeyId", "nativeFingerprint", verified
      FROM "MobileNativeRelease" WHERE id=${input.nativeReleaseId}::uuid FOR UPDATE
    `;
    const native = natives[0];
    if (!native || !native.verified) throw new MobileOtaDeploymentError("UNVERIFIED_RELEASE");
    const previous = await tx.$queryRaw<{
      deploymentId: string; actorId: string; reason: string; action: string;
    }[]>`
      SELECT "deploymentId", "actorId", reason, action
      FROM "MobileOtaAuditEvent" WHERE "operationId"=${input.operationId}
    `;
    if (previous[0]) {
      const row = previous[0];
      const targets = await tx.$queryRaw<Deployment[]>`
        SELECT id, "appId", platform, environment, channel, "runtimeVersion", "signingKeyId", "nativeFingerprint",
          "activeReleaseId", "previousReleaseId", "rowVersion", paused, "rolloutPercent"
        FROM "MobileOtaDeployment" WHERE id=${row.deploymentId}::uuid
      `;
      const deployed = targets[0];
      if (row.action !== "CREATE" || row.actorId !== input.actorId ||
          row.reason !== input.reason || !deployed || deployed.appId !== native.appId ||
          deployed.platform !== native.platform || deployed.environment !== native.environment ||
          deployed.channel !== native.channel || deployed.runtimeVersion !== native.runtimeVersion ||
          deployed.signingKeyId !== native.signingKeyId ||
          deployed.nativeFingerprint !== native.nativeFingerprint)
        throw new MobileOtaDeploymentError("OPERATION_CONFLICT");
      return {id: deployed.id, version: deployed.rowVersion, paused: deployed.paused, replayed: true};
    }
    const id = randomUUID();
    const created = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "MobileOtaDeployment"
        (id, "appId", platform, environment, channel, "runtimeVersion", "signingKeyId", "nativeFingerprint",
         "rowVersion", paused, "rolloutPercent", "updatedAt")
      VALUES (${id}::uuid, ${native.appId}, ${native.platform}, ${native.environment},
        ${native.channel}, ${native.runtimeVersion}, ${native.signingKeyId}, ${native.nativeFingerprint}, 1, true, 0, NOW())
      ON CONFLICT ("appId", platform, environment, channel, "runtimeVersion", "signingKeyId", "nativeFingerprint")
        DO NOTHING RETURNING id
    `;
    if (!created[0]) throw new MobileOtaDeploymentError("DEPLOYMENT_ALREADY_EXISTS");
    await tx.$executeRaw`
      INSERT INTO "MobileOtaAuditEvent"
        (id, "deploymentId", "operationId", action, "actorId", "expectedVersion", "resultingVersion", reason)
      VALUES (${randomUUID()}::uuid, ${id}::uuid, ${input.operationId}, 'CREATE',
        ${input.actorId}, 0, 1, ${input.reason})
    `;
    return {id, version: 1, paused: true as const, replayed: false};
  });
}

export async function updateMobileOtaDeployment(input: {
  deploymentId: string;
  actorId: string;
  operationId: string;
  expectedVersion: number;
  reason: string;
  action: "PUBLISH" | "PAUSE" | "ROLLOUT";
  releaseId?: string;
  rolloutPercent?: number;
}): Promise<{ id: string; version: number; paused: boolean; replayed: boolean }> {
  return prisma.$transaction(async (tx) => {
    const found = await tx.$queryRaw<Deployment[]>`
      SELECT id, "appId", platform, environment, channel, "runtimeVersion", "signingKeyId", "nativeFingerprint",
        "activeReleaseId", "previousReleaseId", "rowVersion", paused, "rolloutPercent"
      FROM "MobileOtaDeployment" WHERE id = ${input.deploymentId}::uuid FOR UPDATE
    `;
    const deployment = found[0];
    if (!deployment) throw new MobileOtaDeploymentError("NOT_FOUND");
    const audit = await tx.$queryRaw<Audit[]>`
      SELECT "deploymentId", action, "actorId", reason, "expectedVersion", "resultingVersion", "releaseId", "rolloutPercent"
      FROM "MobileOtaAuditEvent" WHERE "operationId" = ${input.operationId}
    `;
    const previous = audit[0];
    if (previous) {
      if (previous.deploymentId !== deployment.id || previous.action !== input.action || previous.actorId !== input.actorId ||
        previous.reason !== input.reason || previous.expectedVersion !== input.expectedVersion ||
        (previous.releaseId ?? null) !== (input.releaseId ?? null) ||
        (previous.rolloutPercent ?? null) !== (input.rolloutPercent ?? null))
        throw new MobileOtaDeploymentError("OPERATION_CONFLICT");
      return { id: deployment.id, version: previous.resultingVersion, paused: input.action === "PAUSE", replayed: true };
    }
    if (deployment.rowVersion !== input.expectedVersion)
      throw new MobileOtaDeploymentError("STALE_VERSION");
    if(deployment.appId==="gafus" && deployment.environment==="production" && deployment.channel==="production" &&
      await versionOwnsScope(tx,deployment)) throw new MobileOtaDeploymentError("VERSION_PUBLICATION_MANAGED");
    const publish = input.action === "PUBLISH";
    const rollout = input.action === "ROLLOUT";
    if (publish && !input.releaseId) throw new MobileOtaDeploymentError("UNVERIFIED_RELEASE");
    if (input.action === "PAUSE" && (input.releaseId || input.rolloutPercent !== undefined) ||
        rollout && (input.releaseId || !validOtaPercent(input.rolloutPercent)) ||
        publish && input.rolloutPercent !== 0 && !validOtaPercent(input.rolloutPercent ?? 100))
      throw new MobileOtaDeploymentError("INVALID_ROLLOUT");
    if (rollout) {
      if (deployment.paused || !deployment.activeReleaseId ||
          input.rolloutPercent! <= deployment.rolloutPercent)
        throw new MobileOtaDeploymentError("ROLLOUT_MUST_INCREASE");
      const trusted = await tx.$queryRaw<{id: string}[]>`
        SELECT r.id FROM "MobileOtaRelease" r
        JOIN "MobileNativeRelease" n ON n.id=r."nativeReleaseId"
        WHERE r.id=${deployment.activeReleaseId}::uuid AND r.state='READY'
          AND n.verified=true AND n."nativeFingerprint"=${deployment.nativeFingerprint}
        LIMIT 1
      `;
      if (!trusted[0]) throw new MobileOtaDeploymentError("UNVERIFIED_RELEASE");
    }
    if (publish) {
      const releases = await tx.$queryRaw<Release[]>`
        SELECT r.id, r."createdAt", n.verified
        FROM "MobileOtaRelease" r
        JOIN "MobileNativeRelease" n ON n.id = r."nativeReleaseId"
        WHERE r.id = ${input.releaseId}::uuid AND r.state = 'READY' AND r."releaseTitle" IS NULL
          AND r."appId" = ${deployment.appId}
          AND r.platform = ${deployment.platform}
          AND r.environment = ${deployment.environment}
          AND r.channel = ${deployment.channel}
          AND r."runtimeVersion" = ${deployment.runtimeVersion}
          AND r."signingKeyId" = ${deployment.signingKeyId}
          AND n.verified = true
          AND n.platform = r.platform AND n.environment = r.environment
          AND n."runtimeVersion" = r."runtimeVersion"
          AND n."signingKeyId" = r."signingKeyId"
          AND n."nativeFingerprint" = ${deployment.nativeFingerprint}
          AND EXISTS (SELECT 1 FROM "MobileOtaArtifact" a WHERE a."releaseId" = r.id)
          AND NOT EXISTS (SELECT 1 FROM "MobileOtaArtifact" a WHERE a."releaseId" = r.id AND a.verified = false)
        LIMIT 1
      `;
      if (!releases[0]) throw new MobileOtaDeploymentError("UNVERIFIED_RELEASE");
      if (deployment.activeReleaseId) {
        const current = await tx.$queryRaw<{ createdAt: Date }[]>`
          SELECT "createdAt" FROM "MobileOtaRelease"
          WHERE id = ${deployment.activeReleaseId}::uuid
        `;
        // Expo selects by createdAt; repointing an old update does NOT roll back
        // devices which have already launched a newer update.
        if (current[0] && current[0].createdAt >= releases[0].createdAt)
          throw new MobileOtaDeploymentError("ROLLBACK_REQUIRES_NEW_UPDATE");
      }
    }
    const version = deployment.rowVersion + 1;
    await tx.$executeRaw`
      UPDATE "MobileOtaDeployment"
      SET "activeReleaseId" = ${publish ? input.releaseId : deployment.activeReleaseId}::uuid,
          "previousReleaseId" = ${publish ? deployment.activeReleaseId : deployment.previousReleaseId}::uuid,
          paused = ${input.action === "PAUSE"},
          "rolloutPercent" = ${publish ? input.rolloutPercent ?? 100 : rollout ? input.rolloutPercent! : deployment.rolloutPercent},
          "rowVersion" = ${version},
          "updatedAt" = NOW()
      WHERE id = ${deployment.id}::uuid AND "rowVersion" = ${input.expectedVersion}
    `;
    await tx.$executeRaw`
      INSERT INTO "MobileOtaAuditEvent"
        (id, "deploymentId", "operationId", action, "actorId", "expectedVersion", "resultingVersion", "releaseId", "rolloutPercent", reason, "createdAt")
      VALUES (${randomUUID()}::uuid, ${deployment.id}::uuid, ${input.operationId}, ${input.action},
        ${input.actorId}, ${input.expectedVersion}, ${version}, ${input.releaseId ?? null}::uuid,
        ${input.rolloutPercent ?? null}, ${input.reason}, NOW())
    `;
    return { id: deployment.id, version, paused: input.action === "PAUSE", replayed: false };
  });
}
