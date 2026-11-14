/** Admin user Application bindings. SQL/role row locks are server-owned,
 * Core callbacks decide ACL AFTER the lock, in the same transaction.
 */
import { createAdminUserService } from "@gafus/core/services/adminUser";
import {
  readAdminUserRoles, readAdminUserRole, readAdminUserListRows,
} from "@gafus/identity-write-server/admin-user-reads";
import {
  updateAdminUserRows, deleteAdminUserRows, bindPartnerPromoCodeInTransaction,
} from "@gafus/identity-write-server/admin-user-writes";
import { enqueueAccountStorageCleanup } from "../../account-cleanup/composition/enqueue.js";

export const {
  checkAdminUserMutationAccess,
  readAdminActorRole,
  partnerChangeRequiresAdmin,
  getAllUsers,
  updateUserAdmin,
  deleteUserAdmin,
} = createAdminUserService({
  readAdminUserRoles,
  readAdminUserRole,
  readAdminUserListRows,
  updateAdminUserRows: (userId, input, actorId, authorize) =>
    updateAdminUserRows(userId, input, actorId, {
      authorize,
      bindPartner: (tx, ownerId, promoCodeId) =>
        bindPartnerPromoCodeInTransaction(tx, { userId: ownerId, promoCodeId }),
    }),
  deleteAdminUserRows: (userId, actorId, authorize) =>
    deleteAdminUserRows(userId, actorId, authorize, enqueueAccountStorageCleanup),
});
