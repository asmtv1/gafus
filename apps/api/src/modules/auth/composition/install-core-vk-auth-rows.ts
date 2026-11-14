/** Owning API composition: vk Persistence. The Core facade has no
 * SQL imports; this binds the ORIGINAL transactional implementation. */
import { registerVkAuthRowsPort, type VkAuthRowsPort } from "@gafus/core/services/auth";
import * as sql from "@gafus/identity-write-server/vk-auth-rows";

const rows: VkAuthRowsPort = {
  readVkUserEmail: sql.readVkUserEmail,
  readVkEmailOwner: sql.readVkEmailOwner,
  updateVkUserEmail: sql.updateVkUserEmail,
  readDetailedVkAccount: sql.readDetailedVkAccount,
  readVkUsernameCollision: sql.readVkUsernameCollision,
  upsertLinkedVkProfile: sql.upsertLinkedVkProfile,
  createPendingVkAccount: sql.createPendingVkAccount,
  readVkLinkedAccountOwner: sql.readVkLinkedAccountOwner,
  linkVkAccountAndMergeProfile: sql.linkVkAccountAndMergeProfile,
};
registerVkAuthRowsPort(rows);
