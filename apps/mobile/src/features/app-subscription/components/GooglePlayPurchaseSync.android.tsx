import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAvailablePurchases, initConnection } from "expo-iap";

import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { useAuthStore } from "@/shared/stores/authStore";
import { appSubscriptionGoogleApi } from "../api/appSubscriptionGoogleApi";
import { selectGooglePlayPurchaseTokens } from "../lib/googlePlayPurchaseTokens";

export function GooglePlayPurchaseSync() {
  const owner = useAuthStore((state) => state.user?.id);
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = binding?.principalId === owner ? binding?.authEpoch : undefined;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!owner || !epoch) return;
    let current = true;
    function sameOwner() {
      const live = newOnlyV2NativeQueues.getVerifiedBinding();
      return current && useAuthStore.getState().user?.id === owner &&
        live?.principalId === owner && live?.authEpoch === epoch;
    }
    async function restore() {
      const prepared = await appSubscriptionGoogleApi.prepare(sameOwner);
      if (!sameOwner() || !prepared.data || !await initConnection()) return;
      const purchases = await getAvailablePurchases();
      let entitled = false;
      const tokens = selectGooglePlayPurchaseTokens(
        purchases, prepared.data.plans, prepared.data.accountId,
      );
      for (const token of tokens) {
        if (!sameOwner()) return;
        const result = await appSubscriptionGoogleApi.verify(token, sameOwner);
        entitled ||= result.data?.entitled === true;
      }
      if (entitled && sameOwner()) await queryClient.invalidateQueries({ queryKey: ["app-subscription"] });
    }
    void restore().catch(() => { /* diagnostic: expected Automatic restore is speculative; explicit restore remains available. */
      // The explicit restore action remains available after a transient Play failure.
    });
    return () => { current = false; };
  }, [owner, epoch, queryClient]);

  return null;
}
