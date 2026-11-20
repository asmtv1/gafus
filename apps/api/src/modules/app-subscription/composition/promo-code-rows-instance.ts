/** Authoritative Subscription Promo SQL composition. The adapter preserves
 * SERIALIZABLE transaction, uniqueness (P2002), immutable historical YooKassa
 * blocker, and atomic promo revision + audit snapshots. Core owns all policy.
 */
import {
  type SubscriptionPromoPort,
} from "@gafus/core/services/appSubscription";
import {
  userHasSuccessfulPromoBlockingPayment,
  readPromoSettingsRow,
  readPromoCodeByNormalizedCode,
  withPromoCodeRecordsTransaction,
  isUniquePromoCodeError,
} from "@gafus/subscription-finance-server/promo-code-rows";

export const promoCodeSqlPort: SubscriptionPromoPort = {
  userHasSuccessfulPromoBlockingPayment,
  readPromoSettingsRow,
  readPromoCodeByNormalizedCode,
  withPromoCodeRecordsTransaction,
  isUniquePromoCodeError,
};
