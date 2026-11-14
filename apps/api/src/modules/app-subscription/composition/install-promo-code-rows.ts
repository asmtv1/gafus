/** Authoritative Subscription Promo SQL composition. The adapter preserves
 * SERIALIZABLE transaction, uniqueness (P2002), immutable historical YooKassa
 * blocker, and atomic promo revision + audit snapshots. Core owns all policy.
 */
import {
  registerSubscriptionPromoPort,
  type SubscriptionPromoPort,
} from "@gafus/core/services/appSubscription";
import {
  userHasSuccessfulPromoBlockingPayment,
  readPromoSettingsRow,
  readPromoCodeByNormalizedCode,
  withPromoCodeRecordsTransaction,
  isUniquePromoCodeError,
} from "@gafus/subscription-finance-server/promo-code-rows";

const promoCodeSqlPort: SubscriptionPromoPort = {
  userHasSuccessfulPromoBlockingPayment,
  readPromoSettingsRow,
  readPromoCodeByNormalizedCode,
  withPromoCodeRecordsTransaction,
  isUniquePromoCodeError,
};
registerSubscriptionPromoPort(promoCodeSqlPort);
