/** OFF021 source review ONLY. This module is deliberately NOT imported from
 * app.ts, active offline v2, or any production route. A later reviewed
 * migration must provide a deployed receipt schema, real-PG contention and
 * an exact occurrence+media ACL before this module can be mounted.
 */
import {
  registerOfflineVideoSqlPort,
  type OfflineVideoSqlPort,
} from "@gafus/core/services/offline";
import {
  withOfflineVideoSqlTransaction,
  claimOfflineVideoReceipt,
  findOfflineVideoStoredReceipt,
  reserveOfflineVideoRevision,
  readOfflineVideoRevision,
  advanceOfflineVideoRevision,
  commitOfflineVideoReceipt,
} from "@gafus/course-progress-server/offline-video-rows";

const offlineVideoSql: OfflineVideoSqlPort = {
  withOfflineVideoSqlTransaction: withOfflineVideoSqlTransaction as unknown as OfflineVideoSqlPort["withOfflineVideoSqlTransaction"],
  claimOfflineVideoReceipt: claimOfflineVideoReceipt as unknown as OfflineVideoSqlPort["claimOfflineVideoReceipt"],
  findOfflineVideoStoredReceipt: (tx, ownerId, eventId) =>
    findOfflineVideoStoredReceipt(tx as unknown as Parameters<typeof findOfflineVideoStoredReceipt>[0], ownerId, eventId),
  reserveOfflineVideoRevision: reserveOfflineVideoRevision as unknown as OfflineVideoSqlPort["reserveOfflineVideoRevision"],
  readOfflineVideoRevision: (tx, ownerId, resourceKey) =>
    readOfflineVideoRevision(tx as unknown as Parameters<typeof readOfflineVideoRevision>[0], ownerId, resourceKey),
  advanceOfflineVideoRevision: advanceOfflineVideoRevision as unknown as OfflineVideoSqlPort["advanceOfflineVideoRevision"],
  commitOfflineVideoReceipt: commitOfflineVideoReceipt as unknown as OfflineVideoSqlPort["commitOfflineVideoReceipt"],
};
registerOfflineVideoSqlPort(offlineVideoSql);
