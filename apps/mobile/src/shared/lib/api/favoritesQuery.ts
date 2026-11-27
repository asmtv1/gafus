import { coursesApi } from "./courses";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";

type FavoritesActor = { ownerId: string; authEpoch: string };
function current(actor: FavoritesActor) {
  const auth = useAuthStore.getState();
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  return auth.isAuthenticated && auth.user?.id === actor.ownerId &&
    auth.verifiedSessionEpoch === actor.authEpoch &&
    binding?.principalId === actor.ownerId && binding.authEpoch === actor.authEpoch;
}

/** Private favorites are keyed by the verified owner and session, not just a
 * shared feature name. Prefix invalidation still covers the current key. */
export function favoritesForActor(actor: FavoritesActor) {
  return {
    queryKey: ["favorites", actor.ownerId, actor.authEpoch] as const,
    queryFn: async () => {
      if (!current(actor)) throw new Error("FAVORITES_SESSION_CHANGED");
      const res = await coursesApi.getFavorites();
      if (!current(actor)) throw new Error("FAVORITES_SESSION_CHANGED");
      if (!res.success) throw new Error(res.error ?? "Ошибка загрузки избранных курсов");
      return res;
    },
  };
}
