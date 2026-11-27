/** OFF021 offline video v3 — source review ONLY. This is not a live route or
 * a deployed SQL schema. The caller provides a transaction-scoped, exact
 * occurrence entitlement check; the server owns atomic receipt+revision SQL.
 * No URL/videoId or previous receipt may bypass a revoked entitlement.
 */
import type { authorizeVideoOccurrenceV3 } from "./videoPositionOccurrenceV3";
import type { VideoPositionReceipt } from "./offlineVideoPositionV3Service";

/** The SAME transaction is passed through authorization, receipt claim and CAS.
 * Its type follows the existing Core entitlement policy rather than importing
 * Prisma.TransactionClient from the course-progress server into Core.
 */
export type OfflineVideoPolicyTx = Parameters<typeof authorizeVideoOccurrenceV3>[0];

export type OfflineVideoStoredReceipt = {
  method: string;
  operation: string;
  resourceKey: string;
  payloadHash: string;
  state: string;
  responseStatus: number | null;
  responseBody: VideoPositionReceipt | null;
};

export type OfflineVideoRevisionRow = {
  revision: bigint;
  videoLastPositionSec: number | null;
  videoRecordedAt: Date | null;
};

export interface OfflineVideoSqlPort {
  withOfflineVideoSqlTransaction<T>(cb: (tx: OfflineVideoPolicyTx) => Promise<T>): Promise<T>;
  claimOfflineVideoReceipt(
    tx: OfflineVideoPolicyTx, ownerId: string, eventId: string,
    resourceKey: string, payloadHash: string,
  ): Promise<{ id: string }[]>;
  findOfflineVideoStoredReceipt(
    tx: OfflineVideoPolicyTx, ownerId: string, eventId: string,
  ): Promise<OfflineVideoStoredReceipt[]>;
  reserveOfflineVideoRevision(
    tx: OfflineVideoPolicyTx, ownerId: string, resourceKey: string,
  ): Promise<number>;
  readOfflineVideoRevision(
    tx: OfflineVideoPolicyTx, ownerId: string, resourceKey: string,
  ): Promise<OfflineVideoRevisionRow[]>;
  advanceOfflineVideoRevision(
    tx: OfflineVideoPolicyTx, ownerId: string, resourceKey: string,
    expectedRevision: bigint, next: bigint, positionSec: number, recordedAt: string,
  ): Promise<number>;
  commitOfflineVideoReceipt(
    tx: OfflineVideoPolicyTx, ownerId: string, claimId: string,
    next: bigint, ack: VideoPositionReceipt,
  ): Promise<number>;
}

export function requireOfflineVideoSqlPort(port: OfflineVideoSqlPort | undefined): Readonly<OfflineVideoSqlPort> {
  if (!port) throw new Error("OFFLINE_VIDEO_SQL_PORT_UNBOUND");
  return port;
}
