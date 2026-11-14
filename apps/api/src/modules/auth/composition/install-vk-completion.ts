/** VK REGISTER completion composition: preserve one owner/context advisory lock,
 * one DB transaction for consent+referral+pending-user CAS+LOGIN grant replay.
 * Never accept success based on OAuth cookie or userId without SQL validation.
 */
import { registerVkCompletionPort } from "@gafus/core/services/auth";
import {
  completedConsentLogStatus,
  withLockedVkCompletion,
  revokePriorVkCompletionLoginGrantsTx,
  completePendingVkRegistrationUserTx,
  markVkRegistrationContextCompletedTx,
  createCompletedConsentLogsInTransaction,
  attributePartnerReferralIfCurrentPartnerInTransaction,
} from "@gafus/identity-write-server/vk-completion-rows";

const vkCompletionPort = {
  withLockedVkCompletion,
  revokePriorVkCompletionLoginGrantsTx,
  completePendingVkRegistrationUserTx,
  markVkRegistrationContextCompletedTx,
  createCompletedConsentLogsInTransaction: (
    tx: Parameters<typeof createCompletedConsentLogsInTransaction>[0],
    params: Parameters<typeof createCompletedConsentLogsInTransaction>[1],
  ) => createCompletedConsentLogsInTransaction(tx, params, completedConsentLogStatus),
  attributePartnerReferralIfCurrentPartnerInTransaction,
};
registerVkCompletionPort(vkCompletionPort);
