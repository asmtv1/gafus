import { stepProgressVersion } from "./stepProgressVersion";
/** SQL-only source-review offline v2 journal port; not activated by routing. */

import { Prisma, prisma } from "@gafus/prisma";

import { randomUUID } from "node:crypto";

export type OfflineMutationTx = Prisma.TransactionClient;

export function withOfflineMutationTx<T>(fn: (tx: OfflineMutationTx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { timeout: 10000 });
}

export function claimPracticeReceipt(
  tx: OfflineMutationTx,
  ownerId: string,
  eventId: string,
  operation: string,
  resource: string,
  fingerprint: string,
) {
  return tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO "OfflineMutationReceipt"
          ("id", "ownerId", "eventId", "method", "operation", "resourceKey", "payloadHash", "state")
        VALUES (CAST(${randomUUID()} AS uuid), ${ownerId}, CAST(${eventId} AS uuid),
          'POST', ${operation}, ${resource}, ${fingerprint}, 'RESERVED')
        ON CONFLICT ("ownerId", "eventId") DO NOTHING RETURNING "id"
      `);
}

export function findPracticeReceipt<R>(tx: OfflineMutationTx, ownerId: string, eventId: string) {
  return tx.$queryRaw<R[]>(Prisma.sql`
          SELECT "method", "operation", "resourceKey", "payloadHash", "state", "responseBody"
          FROM "OfflineMutationReceipt"
          WHERE "ownerId" = ${ownerId} AND "eventId" = CAST(${eventId} AS uuid)
        `);
}

export function incrementPracticeRevision(
  tx: OfflineMutationTx,
  ownerId: string,
  resource: string,
) {
  return tx.$queryRaw<{ revision: bigint }[]>(Prisma.sql`
        INSERT INTO "OfflineResourceRevision" ("ownerId", "resourceKey", "revision")
        VALUES (${ownerId}, ${resource}, 1)
        ON CONFLICT ("ownerId", "resourceKey")
          DO UPDATE SET "revision" = "OfflineResourceRevision"."revision" + 1
        RETURNING "revision"
      `);
}

export function commitPracticeReceipt(
  tx: OfflineMutationTx,
  revision: bigint,
  ack: unknown,
  claimId: string,
  ownerId: string,
) {
  return tx.$executeRaw(Prisma.sql`
        UPDATE "OfflineMutationReceipt" SET
          "state" = 'COMMITTED', "revision" = ${revision},
          "responseStatus" = 200, "responseBody" = CAST(${JSON.stringify(ack)} AS jsonb),
          "committedAt" = timezone('UTC', CURRENT_TIMESTAMP)
        WHERE "id" = CAST(${claimId} AS uuid) AND "ownerId" = ${ownerId} AND "state" = 'RESERVED'
      `);
}

export function lookupOfflineMutationReceipt<R>(ownerId: string, eventId: string) {
  return prisma.$queryRaw<R[]>(Prisma.sql`
      SELECT "state", "responseBody" FROM "OfflineMutationReceipt"
      WHERE "ownerId" = ${ownerId} AND "eventId" = CAST(${eventId} AS uuid)
    `);
}

export function lockOwnedPreventionPet(tx: OfflineMutationTx, petId: string, ownerId: string) {
  return tx.$queryRawUnsafe<{ id: string }[]>(
    'SELECT "id" FROM "Pet" WHERE "id" = $1 AND "ownerId" = $2 FOR UPDATE',
    petId,
    ownerId,
  );
}

export function claimPreventionReceipt(
  tx: OfflineMutationTx,
  receiptId: string,
  ownerId: string,
  eventId: string,
  resource: string,
  fingerprint: string,
) {
  return tx.$queryRawUnsafe<{ id: string }[]>(
    'INSERT INTO "OfflineMutationReceipt" ("id","ownerId","eventId","method","operation","resourceKey","payloadHash","state")' +
      " VALUES ($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8)" +
      ' ON CONFLICT ("ownerId","eventId") DO NOTHING RETURNING "id"',
    receiptId,
    ownerId,
    eventId,
    "POST",
    "prevention.batch",
    resource,
    fingerprint,
    "RESERVED",
  );
}

export function findPreventionReceipt<R>(tx: OfflineMutationTx, ownerId: string, eventId: string) {
  return tx.$queryRawUnsafe<R[]>(
    'SELECT "method","operation","resourceKey","payloadHash","state","responseBody"' +
      ' FROM "OfflineMutationReceipt" WHERE "ownerId"=$1 AND "eventId"=$2::uuid',
    ownerId,
    eventId,
  );
}

export function findPreventionBoundClient(tx: OfflineMutationTx, petId: string, clientId: string) {
  return tx.$queryRawUnsafe<{ id: string }[]>(
    'SELECT "id" FROM "OfflinePreventionClientBinding"' +
      ' WHERE "petId"=$1 AND "clientId"=$2::uuid',
    petId,
    clientId,
  );
}

export function readPreventionClientRow(tx: OfflineMutationTx, petId: string, clientId: string) {
  return tx.petPreventionEntry.findUnique({
    where: { petId_clientId: { petId: petId, clientId: clientId } },
    select: { id: true },
  });
}

export function persistPreventionClientBinding(
  tx: OfflineMutationTx,
  ownerId: string,
  petId: string,
  clientId: string,
  payloadHash: string,
  receiptId: string,
) {
  return tx.$executeRawUnsafe(
    'INSERT INTO "OfflinePreventionClientBinding"' +
      ' ("id","ownerId","petId","clientId","payloadHash","receiptId")' +
      " VALUES ($1::uuid,$2,$3,$4::uuid,$5,$6::uuid)",
    randomUUID(),
    ownerId,
    petId,
    clientId,
    payloadHash,
    receiptId,
  );
}

export function incrementPreventionRevision(
  tx: OfflineMutationTx,
  ownerId: string,
  resource: string,
) {
  return tx.$queryRawUnsafe<{ revision: bigint }[]>(
    'INSERT INTO "OfflineResourceRevision" ("ownerId","resourceKey","revision")' +
      ' VALUES ($1,$2,1) ON CONFLICT ("ownerId","resourceKey")' +
      ' DO UPDATE SET "revision"="OfflineResourceRevision"."revision"+1 RETURNING "revision"',
    ownerId,
    resource,
  );
}

export function commitPreventionReceipt(
  tx: OfflineMutationTx,
  revision: bigint,
  ack: unknown,
  receiptId: string,
  ownerId: string,
) {
  return tx.$executeRawUnsafe(
    'UPDATE "OfflineMutationReceipt" SET "state"=$1,"revision"=$2,' +
      ' "responseStatus"=$3,"responseBody"=$4::jsonb,"committedAt"=timezone(\'UTC\', CURRENT_TIMESTAMP)' +
      ' WHERE "id"=$5::uuid AND "ownerId"=$6 AND "state"=$7',
    "COMMITTED",
    revision,
    200,
    JSON.stringify(ack),
    receiptId,
    ownerId,
    "RESERVED",
  );
}


/** One owner-scoped query for a newly downloaded course, not one per day/step. */
export async function readOfflineProgressVersions(ownerId: string, courseId: string): Promise<Record<string, string>> {
  const rows = await prisma.userStep.findMany({
    where: { userTraining: { userId: ownerId, dayOnCourse: { courseId } } },
    select: { id: true, stepOnDayId: true, status: true, paused: true, remainingSec: true, updatedAt: true,
      userTraining: { select: { dayOnCourseId: true } } },
  });
  return Object.fromEntries(rows.flatMap(row => {
    const version = stepProgressVersion(row);
    return version ? [[row.userTraining.dayOnCourseId + ":" + row.stepOnDayId, version]] : [];
  }));
}
