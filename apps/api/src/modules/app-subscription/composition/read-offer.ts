import {
  createSubscriptionOfferReader,
  getAppSubscriptionPromoCodeOfferState,
} from "@gafus/core/services/appSubscription";
import { getMobileFeatureFlagEnabled } from "@gafus/feature-flags-server";
import { getSubscriptionOfferDbSnapshot } from "@gafus/subscription-read-server";
import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";

const readOffer = createSubscriptionOfferReader({
  readOfferSnapshot: getSubscriptionOfferDbSnapshot,
  readMobileFlag: getMobileFeatureFlagEnabled,
  readPromoCodeState: getAppSubscriptionPromoCodeOfferState,
});

export function getAppSubscriptionOffer(...args: Parameters<typeof readOffer>) {
  return withCorrelatedUseCase("subscriptions.offer.read", () => readOffer(...args));
}
