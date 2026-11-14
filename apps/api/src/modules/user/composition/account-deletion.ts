/** Self-delete Application composition, keeping cleanup before cascade IN the transaction. */
import { createAccountDeletionService } from "@gafus/core/services/user";
import {
  readAccountDeletionPreflightRow,
  readAccountDeletionActorRow,
  readAccountDeletionAuthoredCounts,
  readAccountDeletionRequestedAt,
  readAccountDeletionChallenge,
  replaceAccountDeletionChallenge,
  deleteAccountAndPersistCleanup,
  deletionPrismaRequestErrorCode,
} from "@gafus/identity-write-server/account-deletion-rows";
import { enqueueAccountStorageCleanup } from "../../account-cleanup/composition/enqueue.js";

export const {
  readAccountDeletionPreflight,
  requestAccountDeletionCode,
  deleteUserAccount,
} = createAccountDeletionService({
  readAccountDeletionPreflightRow,
  readAccountDeletionActorRow,
  readAccountDeletionAuthoredCounts,
  readAccountDeletionRequestedAt,
  readAccountDeletionChallenge,
  replaceAccountDeletionChallenge,
  deleteAccountAndPersistCleanup: (actorId, role, hadEmail, at) =>
    deleteAccountAndPersistCleanup(actorId, role, hadEmail, at, enqueueAccountStorageCleanup),
  deletionPrismaRequestErrorCode,
});
