import { appSubscriptionApi } from "../api/appSubscriptionApi";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { useAuthStore } from "@/shared/stores/authStore";
import {
  createAppleTokenInitializationAdapter,
  type AppleInitActor,
  type AppleReadOnlyOfferSnapshot,
  type AppleTokenInitializationResponse,
} from "./appleTokenInitializationAdapter";

/**
 * Explicit AG4 Phase-A SOURCE/MOCK-only bridge. NOT exported from feature index,
 * NOT imported by live paywall, does not import StoreKit or issue requests on load.
 * Existing GET /offer is legacy (may ensure token); Phase B read-only is DENIED.
 */
export function getVerifiedApplePhaseAActor(): AppleInitActor | null {
  const auth = useAuthStore.getState();
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  if (
    !auth.isAuthenticated ||
    auth.isLoading ||
    !auth.user?.id ||
    binding?.principalId !== auth.user.id ||
    !binding.authEpoch
  )
    return null;
  return { ownerId: auth.user.id, authEpoch: binding.authEpoch };
}

/**
 * The purchase callback is injected by synthetic tests ONLY. No actual StoreKit
 * consumer is connected until separate AG4 physical parity / integration grant.
 */
export function createApplePhaseAHttpReviewAdapter<T>(
  purchase: (params: {
    productId: string;
    appAccountToken: string;
    isCurrentAccount(): boolean;
  }) => Promise<T>,
) {
  const sameActor = (actor: AppleInitActor): boolean => {
    const current = getVerifiedApplePhaseAActor();
    return current?.ownerId === actor.ownerId && current.authEpoch === actor.authEpoch;
  };
  return createAppleTokenInitializationAdapter<T>({
    currentActor: getVerifiedApplePhaseAActor,
    fetchSnapshot: async (): Promise<AppleReadOnlyOfferSnapshot> => {
      const captured = getVerifiedApplePhaseAActor();
      if (!captured) return { success: false, code: "SESSION_CHANGED" };
      // Compatibility: original GET /offer still ensures token for old iOS clients.
      const response = await appSubscriptionApi.getOffer(() => sameActor(captured));
      if (!sameActor(captured)) return { success: false, code: "SESSION_CHANGED" };
      if (!response.success || !response.data)
        return { success: false, code: response.code ?? "OFFER_UNAVAILABLE" };
      if (
        response.data.appleAppAccountToken !== null &&
        typeof response.data.appleAppAccountToken !== "string"
      )
        return { success: false, code: "INVALID_OFFER" };
      return { success: true, data: { appleAppAccountToken: response.data.appleAppAccountToken } };
    },
    initializeToken: async (): Promise<AppleTokenInitializationResponse> => {
      const captured = getVerifiedApplePhaseAActor();
      if (!captured) return { success: false, code: "SESSION_CHANGED" };
      const response = await appSubscriptionApi.initializeAppleAppAccountToken(() =>
        sameActor(captured),
      );
      if (!sameActor(captured)) return { success: false, code: "SESSION_CHANGED" };
      if (!response.success || typeof response.data?.appleAppAccountToken !== "string")
        return { success: false, code: response.code ?? "INIT_UNAVAILABLE" };
      return { success: true, data: { appleAppAccountToken: response.data.appleAppAccountToken } };
    },
    purchase,
  });
}
