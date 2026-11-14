/** Worker-only payment reconciler composition. Never starts its own job or transaction.
 * Reuses the same Core promo validation and server-owned transitions as the API.
 */
import { createPaymentService } from "@gafus/subscription-payment-server/service";
import {
  AppSubscriptionPromoCodeDomainError,
  isAppSubscriptionPromoCodeEntryEnabled,
} from "@gafus/core/services/appSubscription";

const service = createPaymentService({
  AppSubscriptionPromoCodeDomainError,
  isAppSubscriptionPromoCodeEntryEnabled,
});
export const {
  reconcileAppleAppSubscriptionsFromServer,
  reconcileStaleYookassaPendingAppSubscriptions,
} = service;
