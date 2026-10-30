/* eslint-disable @gafus/require-client-catch-tracer -- Mock-injected payment errors may contain tokens: expose only redacted outcomes, never raw exceptions. */
import { getApplePurchaseReadiness } from "./applePurchaseReadiness";

/** AG1/AG4 Phase-A review DTO. No HTTP implementation or provider calls in this module. */
export type AppleTokenInitializationResponse =
  | { success: true; data: { appleAppAccountToken: string } }
  | { success: false; code?: string };
export type AppleReadOnlyOfferSnapshot =
  | { success: true; data: { appleAppAccountToken: string | null } }
  | { success: false; code?: string };
export type AppleInitActor = Readonly<{ ownerId: string; authEpoch: string }>;

export type AppleTokenInitResult<T> =
  | { ok: true; value: T; source: "existing_token" | "explicit_init" }
  | {
      ok: false;
      reason:
        | "SESSION_CHANGED"
        | "ALREADY_IN_PROGRESS"
        | "SNAPSHOT_UNAVAILABLE"
        | "INITIALIZATION_NOT_APPROVED"
        | "INITIALIZATION_FAILED"
        | "TOKEN_INVALID"
        | "READBACK_UNVERIFIED"
        | "PURCHASE_UNKNOWN";
    };

/**
 * IMPORTANT: initializeToken is deliberately NOT assigned to an API endpoint.
 * AG1 review route is unmounted and Phase A still conditional. A future caller
 * may inject an approved, authenticated requestGuard-protected implementation.
 * No client-generated UUID, no token logging, no retry of unknown provider result.
 */
export function createAppleTokenInitializationAdapter<T>(deps: {
  currentActor(): AppleInitActor | null;
  fetchSnapshot(): Promise<AppleReadOnlyOfferSnapshot>;
  initializeToken?: () => Promise<AppleTokenInitializationResponse>;
  purchase(params: {
    productId: string;
    appAccountToken: string;
    isCurrentAccount(): boolean;
  }): Promise<T>;
}) {
  let inFlight = false;
  const sameActor = (actor: AppleInitActor) => {
    const current = deps.currentActor();
    return current?.ownerId === actor.ownerId && current.authEpoch === actor.authEpoch;
  };
  async function begin(productId: string): Promise<AppleTokenInitResult<T>> {
    if (inFlight) return { ok: false, reason: "ALREADY_IN_PROGRESS" };
    const actor = deps.currentActor();
    if (!actor?.ownerId || !actor.authEpoch || !sameActor(actor))
      return { ok: false, reason: "SESSION_CHANGED" };
    inFlight = true;
    try {
      let offer: AppleReadOnlyOfferSnapshot;
      try {
        offer = await deps.fetchSnapshot();
      } catch {
        return { ok: false, reason: "SNAPSHOT_UNAVAILABLE" };
      }
      if (!sameActor(actor)) return { ok: false, reason: "SESSION_CHANGED" };
      if (!offer.success) return { ok: false, reason: "SNAPSHOT_UNAVAILABLE" };
      let token = offer.data?.appleAppAccountToken ?? null;
      let source: "existing_token" | "explicit_init" = "existing_token";
      const before = getApplePurchaseReadiness(productId, token, true);
      if (!before.ready && before.reason === "NO_PRODUCT")
        return { ok: false, reason: "TOKEN_INVALID" };
      if (!before.ready) {
        if (token !== null) return { ok: false, reason: "TOKEN_INVALID" };
        if (!deps.initializeToken) return { ok: false, reason: "INITIALIZATION_NOT_APPROVED" };
        // Exactly one explicit initialization call; NEVER implicit GET mutation.
        let initialized: AppleTokenInitializationResponse;
        try {
          initialized = await deps.initializeToken();
        } catch {
          return { ok: false, reason: "INITIALIZATION_FAILED" };
        }
        if (!sameActor(actor)) return { ok: false, reason: "SESSION_CHANGED" };
        if (!initialized.success) return { ok: false, reason: "INITIALIZATION_FAILED" };
        token = initialized.data?.appleAppAccountToken ?? null;
        if (!getApplePurchaseReadiness(productId, token, true).ready)
          return { ok: false, reason: "TOKEN_INVALID" };
        // Read-only owner-bound readback: a response alone is not an entitlement.
        let confirmed: AppleReadOnlyOfferSnapshot;
        try {
          confirmed = await deps.fetchSnapshot();
        } catch {
          return { ok: false, reason: "READBACK_UNVERIFIED" };
        }
        if (!sameActor(actor)) return { ok: false, reason: "SESSION_CHANGED" };
        if (
          !confirmed.success ||
          confirmed.data?.appleAppAccountToken !== token ||
          !getApplePurchaseReadiness(productId, confirmed.data?.appleAppAccountToken, true).ready
        )
          return { ok: false, reason: "READBACK_UNVERIFIED" };
        source = "explicit_init";
      }
      const ready = getApplePurchaseReadiness(productId, token, sameActor(actor));
      if (!ready.ready) return { ok: false, reason: "SESSION_CHANGED" };
      try {
        const value = await deps.purchase({
          productId: ready.productId,
          appAccountToken: ready.stableToken,
          isCurrentAccount: () => sameActor(actor),
        });
        if (!sameActor(actor)) return { ok: false, reason: "SESSION_CHANGED" };
        return { ok: true, value, source };
      } catch {
        return { ok: false, reason: "PURCHASE_UNKNOWN" };
      }
    } finally {
      inFlight = false;
    }
  }
  return { begin };
}
