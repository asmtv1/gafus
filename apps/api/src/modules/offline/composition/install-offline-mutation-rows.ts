/** Owning API composition: offline Persistence. The Core facade has no
 * SQL imports; this binds the ORIGINAL transactional implementation. */
import { registerOfflineMutationRowsPort, type OfflineMutationRowsPort } from "@gafus/core/services/offline";
import * as sql from "@gafus/course-progress-server/offline-mutation-rows";

/** Exact SQL rows still carry Prisma delegate/transaction types. The bridge at
 * this application-owned boundary is solely a TypeScript representation
 * conversion; it does not wrap/replace the SQL, lock, CAS, or owner checks.
 * Non-cast methods remain checked structurally by the Port contract. */
const rows: OfflineMutationRowsPort = {
  withOfflineMutationTx: sql.withOfflineMutationTx,
  claimPracticeReceipt: sql.claimPracticeReceipt as unknown as OfflineMutationRowsPort["claimPracticeReceipt"],
  findPracticeReceipt: sql.findPracticeReceipt as unknown as OfflineMutationRowsPort["findPracticeReceipt"],
  incrementPracticeRevision: sql.incrementPracticeRevision as unknown as OfflineMutationRowsPort["incrementPracticeRevision"],
  commitPracticeReceipt: sql.commitPracticeReceipt as unknown as OfflineMutationRowsPort["commitPracticeReceipt"],
  lookupOfflineMutationReceipt: sql.lookupOfflineMutationReceipt,
  lockOwnedPreventionPet: sql.lockOwnedPreventionPet as unknown as OfflineMutationRowsPort["lockOwnedPreventionPet"],
  claimPreventionReceipt: sql.claimPreventionReceipt as unknown as OfflineMutationRowsPort["claimPreventionReceipt"],
  findPreventionReceipt: sql.findPreventionReceipt as unknown as OfflineMutationRowsPort["findPreventionReceipt"],
  findPreventionBoundClient: sql.findPreventionBoundClient as unknown as OfflineMutationRowsPort["findPreventionBoundClient"],
  readPreventionClientRow: sql.readPreventionClientRow as unknown as OfflineMutationRowsPort["readPreventionClientRow"],
  persistPreventionClientBinding: sql.persistPreventionClientBinding as unknown as OfflineMutationRowsPort["persistPreventionClientBinding"],
  incrementPreventionRevision: sql.incrementPreventionRevision as unknown as OfflineMutationRowsPort["incrementPreventionRevision"],
  commitPreventionReceipt: sql.commitPreventionReceipt as unknown as OfflineMutationRowsPort["commitPreventionReceipt"],
};
registerOfflineMutationRowsPort(rows);
