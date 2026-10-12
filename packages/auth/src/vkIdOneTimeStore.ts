/** VK one-time grants are claimed and persisted transactionally in core. */
export {
  consumeVkIdOneTimeUser, completeVkIdOneTimeConsent,
  getVkIdUserFromToken, storeVkIdOneTimeUser,
} from "@gafus/core/services/auth/vkGrant";
export type { VkIdUser } from "@gafus/core/services/auth/vkGrant";
