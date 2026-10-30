/** Mobile-only read-side guard: never invent an Apple identity or an init route. */
const UUID_V4 = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

export type ApplePurchaseReadiness =
  | { ready: true; productId: string; stableToken: string }
  | { ready: false; reason: "NO_PRODUCT" | "TOKEN_INITIALIZATION_REQUIRED" | "SESSION_UNVERIFIED" };

/** Future read-only offer may return null until an explicitly approved init command runs. */
export function getApplePurchaseReadiness(
  productId: string | null | undefined,
  persistedToken: string | null | undefined,
  verifiedSession: boolean,
): ApplePurchaseReadiness {
  if (!verifiedSession) return { ready: false, reason: "SESSION_UNVERIFIED" };
  if (typeof productId !== "string" || !productId.trim())
    return { ready: false, reason: "NO_PRODUCT" };
  if (typeof persistedToken !== "string" || !UUID_V4.test(persistedToken))
    return { ready: false, reason: "TOKEN_INITIALIZATION_REQUIRED" };
  return { ready: true, productId, stableToken: persistedToken };
}
