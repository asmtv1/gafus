/** Offline v3 proposal SQL only. NEVER used on active v2 routing or deployed schema. */

import { randomUUID } from "node:crypto";

import { prisma, Prisma } from "@gafus/prisma";

export type OfflineVideoSqlTx = Prisma.TransactionClient;

export function withOfflineVideoSqlTransaction<T>(
  cb: (tx: OfflineVideoSqlTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(cb, { timeout: 10000 });
}

export function claimOfflineVideoReceipt(
  tx: OfflineVideoSqlTx,
  ownerId: string,
  eventId: string,
  resourceKey: string,
  payloadHash: string,
) {
  return tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO "OfflineMutationReceipt"
        ("id","ownerId","eventId","method","operation","resourceKey","payloadHash","state")
      VALUES (CAST(${randomUUID()} AS uuid),${ownerId},CAST(${eventId} AS uuid),
        'POST','video.position',${resourceKey},${payloadHash},'RESERVED')
      ON CONFLICT ("ownerId","eventId") DO NOTHING RETURNING "id"
    `);
}

export function findOfflineVideoStoredReceipt<R>(
  tx: OfflineVideoSqlTx,
  ownerId: string,
  eventId: string,
) {
  return tx.$queryRaw<R[]>(Prisma.sql`
        SELECT "method","operation","resourceKey","payloadHash","state","responseStatus","responseBody"
        FROM "OfflineMutationReceipt" WHERE "ownerId"=${ownerId}
          AND "eventId"=CAST(${eventId} AS uuid)
      `);
}

export function reserveOfflineVideoRevision(
  tx: OfflineVideoSqlTx,
  ownerId: string,
  resourceKey: string,
) {
  return tx.$executeRaw(Prisma.sql`
      INSERT INTO "OfflineResourceRevision" ("ownerId","resourceKey","revision")
      VALUES (${ownerId},${resourceKey},0)
      ON CONFLICT ("ownerId","resourceKey") DO NOTHING
    `);
}

export function readOfflineVideoRevision<R>(
  tx: OfflineVideoSqlTx,
  ownerId: string,
  resourceKey: string,
) {
  return tx.$queryRaw<R[]>(Prisma.sql`
      SELECT "revision","videoLastPositionSec","videoRecordedAt"
      FROM "OfflineResourceRevision"
      WHERE "ownerId"=${ownerId} AND "resourceKey"=${resourceKey} FOR UPDATE
    `);
}

export function advanceOfflineVideoRevision(
  tx: OfflineVideoSqlTx,
  ownerId: string,
  resourceKey: string,
  expectedRevision: bigint,
  next: bigint,
  positionSec: number,
  recordedAt: string,
) {
  return tx.$executeRaw(Prisma.sql`
      UPDATE "OfflineResourceRevision" SET
        "revision"=${next},"videoLastPositionSec"=${positionSec},
        "videoRecordedAt"=CAST(${recordedAt} AS timestamptz)
      WHERE "ownerId"=${ownerId} AND "resourceKey"=${resourceKey}
        AND "revision"=${expectedRevision}
    `);
}

export function commitOfflineVideoReceipt(
  tx: OfflineVideoSqlTx,
  ownerId: string,
  claimId: string,
  next: bigint,
  ack: unknown,
) {
  return tx.$executeRaw(Prisma.sql`
      UPDATE "OfflineMutationReceipt" SET "state"='COMMITTED',"revision"=${next},
        "responseStatus"=200,"responseBody"=CAST(${JSON.stringify(ack)} AS jsonb),
        "committedAt"=timezone('UTC', CURRENT_TIMESTAMP)
      WHERE "id"=CAST(${claimId} AS uuid) AND "ownerId"=${ownerId}
        AND "state"='RESERVED'
    `);
}
