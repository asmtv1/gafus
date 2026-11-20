import {
  createSubscriptionOfferReader,
  getAppSubscriptionPromoCodeOfferState,
} from "@gafus/core/services/appSubscription";
import { getMobileFeatureFlagEnabled } from "@gafus/feature-flags-server";
import { getSubscriptionOfferDbSnapshot } from "@gafus/subscription-read-server";
import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
import { promoCodeSqlPort } from "./promo-code-rows-instance.js";

const readOffer = createSubscriptionOfferReader({
  readOfferSnapshot: getSubscriptionOfferDbSnapshot,
  readMobileFlag: getMobileFeatureFlagEnabled,
  readPromoCodeState: (params) => getAppSubscriptionPromoCodeOfferState(params, promoCodeSqlPort),
});

export function getAppSubscriptionOffer(...args: Parameters<typeof readOffer>) {
  return withCorrelatedUseCase("subscriptions.offer.read", () => readOffer(...args));
}
