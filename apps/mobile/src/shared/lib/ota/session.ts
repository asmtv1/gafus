import { getSettledAuthSessionGeneration, useAuthStore } from "@/shared/stores/authStore";

export function captureOtaSession() {
  const state = useAuthStore.getState();
  const generation = getSettledAuthSessionGeneration();
  const userId = state.isAuthenticated ? state.user?.id ?? null : null;
  const epoch = state.isAuthenticated ? state.verifiedSessionEpoch : null;
  if (state.isLoading || generation === null || (state.isAuthenticated && (!userId || !epoch))) {
    return null;
  }
  return {
    userId,
    epoch,
    generation,
    isCurrent: () => {
      const current = useAuthStore.getState();
      return getSettledAuthSessionGeneration() === generation && !current.isLoading &&
        (userId ? current.isAuthenticated && current.user?.id === userId &&
          current.verifiedSessionEpoch === epoch : !current.isAuthenticated);
    },
  };
}

export type OtaSession = NonNullable<ReturnType<typeof captureOtaSession>>;
