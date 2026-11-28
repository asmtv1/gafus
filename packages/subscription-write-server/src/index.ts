/** Mutating transactional adapters for billing and NPD; no Core imports. */
export { getNpdBootstrapDeviceId, saveNpdBootstrapConnection } from "./npdBootstrapService";
export { applyNpdFiscalizationCutover } from "./npdCutoverService";
export { initializeAppleTokenForAuthenticatedOwner, AppleTokenOwnerUnavailableError } from "./appleTokenInitializationReview";
export type { AppleTokenInitializationDto } from "./appleTokenInitializationReview";

export { listDueYookassaSubscriptionRenewals, getRenewalBuyerEmail } from "./renewalCandidatesService";
export { listDueSubscriptionRenewalReminders, markSubscriptionRenewalReminderSent } from "./renewalReminderService";
export { processDueNpdReceiptEmailDeliveriesCore } from "./npdEmailDeliveryService";
export type { NpdEmailWorkerResult } from "./npdEmailDeliveryService";

export { getFreePartnerPromoCodesForAdminPanel, listPartnerAdminBalances, listPartnerAdminBalancePage,
  getPartnerAdminBalanceDetail, getPartnerAdminBalanceDetailPage, markPartnerBalancePaidAdmin } from "./adminPartnerService";

export { prepareYookassaRenewalAttempt, isYookassaRenewalStillEligible } from "./renewalAttemptService";
export { recordYookassaRenewalFailure, recordYookassaRenewalProviderId, recordYookassaRenewalCanceled } from "./renewalProviderResultService";
