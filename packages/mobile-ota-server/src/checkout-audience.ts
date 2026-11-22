/** Signed OTA checkout audience gates. ALL is iOS App Store 1.7.5 only; fail closed. */
export type CheckoutScope = { platform: "ios" | "android"; runtimeVersion: string };
export type CheckoutAudience = {
  allowsCheckout: boolean;
  running: boolean;
  publicationAction: "TEST" | "ALL" | "RECOVER" | "STOP";
  publishedToAll: boolean;
};

export function mayPublishCheckoutToAll(scope: CheckoutScope, approval: string | undefined): boolean {
  return scope.platform === "ios" && scope.runtimeVersion === "1.7.5" && approval === "true";
}

export function mayOfferCheckoutToAudience(
  scope: CheckoutScope, selected: CheckoutAudience | null | undefined, publicEnabled: string | undefined,
): boolean {
  if (!selected?.allowsCheckout || !selected.running) return false;
  if (selected.publicationAction === "TEST" && !selected.publishedToAll) return true;
  return selected.publicationAction === "ALL" && selected.publishedToAll &&
    mayPublishCheckoutToAll(scope, publicEnabled);
}
