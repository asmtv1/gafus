/** Payment transition composition root for authenticated API and provider hooks.
 * SQL/provider transport stays in the server package; Core provides only
 * validated promo-code policy and its public typed error.
 */
import { createPaymentService } from "@gafus/subscription-payment-server/service";
import {
  AppSubscriptionPromoCodeDomainError,
  isAppSubscriptionPromoCodeEntryEnabled,
} from "@gafus/core/services/appSubscription";

export const {
  startYookassaAppSubscriptionPayment,
  reconcilePendingYookassaAppSubscription,
  reconcileStaleYookassaPendingAppSubscriptions,
  cancelYookassaAppSubscription,
  verifyAppleAppSubscription,
  syncAppleAppSubscriptionFromServer,
  reconcileAppleAppSubscriptionsFromServer,
  restoreAppleAppSubscription,
  handleYookassaAppSubscriptionWebhook,
  handleAppleAppSubscriptionNotification,
} = createPaymentService({
  AppSubscriptionPromoCodeDomainError,
  isAppSubscriptionPromoCodeEntryEnabled,
});
