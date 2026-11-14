/** VK one-time grants are claimed and persisted transactionally in core. */
export {
  consumeVkIdOneTimeUser, completeVkIdOneTimeConsent,
  getVkIdUserFromToken, storeVkIdOneTimeUser,
} from "./vkGrant.js";
export type { VkIdUser } from "./vkGrant.js";
