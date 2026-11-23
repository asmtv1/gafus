// PostgreSQL persistence adapter for version-scoped OTA publication.
// Rules and transitions live in version-publication.ts; only this file owns SQL.
import { Prisma, prisma } from "@gafus/prisma";
import type { VersionScope } from "./version-publication.js";

type Query = Pick<Prisma.TransactionClient, "$queryRaw">;
type LockClient = Pick<Prisma.TransactionClient, "$executeRaw" | "$queryRaw">;
async function lockScope(tx: LockClient, scope: { platform: string; runtimeVersion: string }) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('gafus-version-ota'),hashtext(${scope.platform + "/" + scope.runtimeVersion}))`;
}
export async function versionOwnsScope(
  tx: LockClient,
  scope: { platform: string; runtimeVersion: string },
) {
  await lockScope(tx, scope);
  const rows = await tx.$queryRaw<
    { sequence: number }[]
  >`SELECT sequence FROM "MobileOtaPublication"
    WHERE platform=${scope.platform} AND "runtimeVersion"=${scope.runtimeVersion} LIMIT 1`;
  return rows.length > 0;
}
export type Publication = {
  sequence: number;
  action: "TEST" | "ALL" | "RECOVER" | "STOP";
  public: boolean;
  required: boolean;
  revision: number;
  title: string;
  releaseIds: string[];
  operationId: string;
  actorId: string;
};
export type BuildRow = {
  nativeId: string;
  distribution: string;
  verified: boolean;
  embedded: string | null;
  id: string | null;
  revision: number;
  title: string;
  sourceSha: string;
  recoveryFor: number | null;
  checkout: boolean;
  ready: boolean;
  newer: boolean;
};
async function inventory(db: Query, scope: VersionScope) {
  return db.$queryRaw<BuildRow[]>`
    SELECT n.id AS "nativeId", n.distribution,n.verified,n."embeddedUpdateId" AS embedded,r.id,r.revision,
      r."releaseTitle" AS title,r."sourceSha",r."recoveryFor",r."allowsCheckout" AS checkout,
      (r.state='READY' AND r."signingExpiresAt">now() AND n.verified AND n."embeddedUpdateId" IS NOT NULL AND n."appVersion"=n."runtimeVersion"
        AND NOT EXISTS (SELECT 1 FROM "MobileNativeRelease" other WHERE other.id<>n.id AND other."embeddedUpdateId"=n."embeddedUpdateId"
          AND other."appId"=n."appId" AND other.platform=n.platform AND other.environment=n.environment AND other.channel=n.channel
          AND other."runtimeVersion"=n."runtimeVersion" AND other."nativeFingerprint"=n."nativeFingerprint" AND other."signingKeyId"=n."signingKeyId")
        AND length(r."signatureHeader")>0 AND octet_length(r."manifestBody")>0
        AND (NOT r."allowsCheckout" OR n.distribution='internal' OR (n.platform='ios' AND n.distribution='app-store' AND n."runtimeVersion"='1.7.5') OR (n.platform='android' AND n.distribution='rustore' AND n."runtimeVersion"='1.7.5'))
        AND EXISTS(SELECT 1 FROM "MobileOtaArtifact" a WHERE a."releaseId"=r.id)
        AND NOT EXISTS(SELECT 1 FROM "MobileOtaArtifact" a WHERE a."releaseId"=r.id AND NOT a.verified)) AS ready,
      NOT EXISTS(SELECT 1 FROM "MobileOtaRelease" prior WHERE
        (prior."createdAt">=r."createdAt" OR prior.revision>=r.revision) AND
        (EXISTS(SELECT 1 FROM "MobileOtaPublication" p WHERE p.platform=n.platform AND p."runtimeVersion"=n."runtimeVersion"
          AND prior.id=ANY(p."releaseIds") AND prior."nativeReleaseId"=n.id)
         OR EXISTS(SELECT 1 FROM "MobileOtaDeployment" d WHERE d."appId"=n."appId" AND d.platform=n.platform
          AND d."runtimeVersion"=n."runtimeVersion" AND d.channel=n.channel AND d.environment=n.environment
          AND d."nativeFingerprint"=n."nativeFingerprint" AND d."signingKeyId"=n."signingKeyId"
          AND prior.id IN (d."activeReleaseId",d."previousReleaseId")))) AS newer
    FROM "MobileNativeRelease" n LEFT JOIN "MobileOtaRelease" r ON r."nativeReleaseId"=n.id
      AND r."appId"=n."appId" AND r.platform=n.platform AND r.environment=n.environment AND r.channel=n.channel
      AND r."runtimeVersion"=n."runtimeVersion" AND r."signingKeyId"=n."signingKeyId" AND r."releaseTitle" IS NOT NULL
    WHERE n."appId"='gafus' AND n.environment='production' AND n.channel='production'
      AND n.platform=${scope.platform} AND n."runtimeVersion"=${scope.runtimeVersion}
    ORDER BY n.id,r.id`;
}

async function latest(db: Query, scope: VersionScope): Promise<Publication | null> {
  const [active] = await db.$queryRaw<Publication[]>`SELECT * FROM "MobileOtaPublication"
    WHERE platform=${scope.platform} AND "runtimeVersion"=${scope.runtimeVersion} ORDER BY sequence DESC LIMIT 1`;
  return active ?? null;
}

export type VersionPublicationReader = {
  inventory(scope: VersionScope): Promise<BuildRow[]>;
  latest(scope: VersionScope): Promise<Publication | null>;
};
export type VersionPublicationUnitOfWork = VersionPublicationReader & {
  findOperation(operationId: string): Promise<{sequence: number; commandHash: string} | null>;
  append(row: Publication & {platform: string; runtimeVersion: string; commandHash: string}): Promise<void>;
};
function reader(db: Query): VersionPublicationReader {
  return {
    inventory: (scope) => inventory(db, scope),
    latest: (scope) => latest(db, scope),
  };
}
export const versionPublicationReader = reader(prisma);

// Advisory lock, idempotency read, state read and append share ONE serializable transaction.
export async function withVersionPublicationTransaction<T>(
  scope: VersionScope,
  callback: (tx: VersionPublicationUnitOfWork) => Promise<T>,
): Promise<T> {
  // PostgreSQL SSI may abort one of two concurrent writers even with the
  // same advisory lock: its SERIALIZABLE snapshot predates the other writer.
  // Retry the *entire* transaction, never an individual append, so both the
  // observed preview and operationId replay are re-evaluated after the winner
  // commits. Do not retry domain validation errors or provider/network calls.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
    await lockScope(tx, scope);
    const port: VersionPublicationUnitOfWork = {
      ...reader(tx),
      async findOperation(operationId) {
        const [replay] = await tx.$queryRaw<
          { sequence: number; commandHash: string }[]
        >`SELECT sequence,"commandHash" FROM
        "MobileOtaPublication" WHERE "operationId"=${operationId}::uuid`;
        return replay ?? null;
      },
      async append(row) {
        const {platform, runtimeVersion, sequence, operationId, commandHash:hash, actorId, action, public: visible, required, revision, title, releaseIds} = row;
        await tx.$executeRaw`INSERT INTO "MobileOtaPublication" (platform,"runtimeVersion",sequence,"operationId","commandHash",
        "actorId",action,public,required,revision,title,"releaseIds")
      VALUES (${platform},${runtimeVersion},${sequence},${operationId}::uuid,${hash},${actorId},${action},
        ${visible},${required},${revision},${title},${releaseIds}::uuid[])`;
      },
    };
    return callback(port);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String(error.code) : "";
      const meta = typeof error === "object" && error !== null && "meta" in error
        ? error.meta : undefined;
      const sqlState = typeof meta === "object" && meta !== null && "code" in meta
        ? String(meta.code) : "";
      const retryable = code === "P2034" || (code === "P2010" &&
        (sqlState === "40001" || sqlState === "40P01"));
      if (!retryable || attempt === 3) throw error;
    }
  }
  throw new Error("VERSION_PUBLICATION_TX_RETRY_EXHAUSTED");
}
