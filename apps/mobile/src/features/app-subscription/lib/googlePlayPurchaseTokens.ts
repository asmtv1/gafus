/**
 * Android's restored purchases do not always expose an obfuscated account ID.
 * Never treat the missing client-side field as proof of another owner: the API
 * validates the purchase token against the Google Play Developer API and the
 * account's server-owned obfuscated ID before granting Premium.
 */
export function selectGooglePlayPurchaseTokens(
  purchases: readonly {
    store: string;
    productId: string;
    purchaseToken?: string | null;
    obfuscatedAccountIdAndroid?: string | null;
  }[],
  plans: readonly { productId: string }[],
  accountId: string,
): string[] {
  if (!accountId) return [];
  const allowedProducts = new Set(plans.map((plan) => plan.productId));
  return Array.from(new Set(purchases.flatMap((purchase) =>
    purchase.store === "google" &&
    allowedProducts.has(purchase.productId) &&
    purchase.purchaseToken &&
    (!purchase.obfuscatedAccountIdAndroid || purchase.obfuscatedAccountIdAndroid === accountId)
      ? [purchase.purchaseToken] : [],
  )));
}
