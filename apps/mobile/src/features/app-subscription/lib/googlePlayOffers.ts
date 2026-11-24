import { appSubscriptionTierIncludesConsultations } from "@gafus/types";
import { fetchProducts, initConnection } from "expo-iap";
import type { GooglePlayPlan } from "../api/appSubscriptionGoogleApi";

export async function loadGooglePlayOffers(plans: GooglePlayPlan[]) {
  const purchasablePlans = plans.filter((plan) => appSubscriptionTierIncludesConsultations(plan.planCode));
  if (!purchasablePlans.length) return [];
  if (!await initConnection()) throw new Error("GOOGLE_PLAY_CONNECTION");
  const products = await fetchProducts({ type: "subs", skus: [...new Set(purchasablePlans.map((p) => p.productId))] });
  return purchasablePlans.flatMap((plan) => {
    const product = products?.find((item) => item.id === plan.productId && item.type === "subs" && item.platform === "android");
    if (product?.platform !== "android" || product.type !== "subs") return [];
    const offer = product.subscriptionOfferDetailsAndroid?.find((item) =>
      item.basePlanId === plan.basePlanId && !item.offerId && !item.installmentPlanDetails);
    const phase = offer?.pricingPhases.pricingPhaseList[0];
    if (!offer || !phase?.formattedPrice || !phase.billingPeriod) return [];
    const period = /^P(\d+)(D|W|M|Y)$/.exec(phase.billingPeriod);
    const units = { D: "дн.", W: "нед.", M: "мес.", Y: "г." };
    return [{ ...plan, title: product.title, price: phase.formattedPrice,
      period: period ? period[1] + " " + units[period[2] as keyof typeof units] : phase.billingPeriod,
      offerToken: offer.offerToken }];
  });
}
