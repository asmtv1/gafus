interface MobileOnboardingTourAutostartState {
  hasLoadedStatus: boolean;
  hasSeenV1: boolean;
  isActive: boolean;
  isAuthenticated: boolean;
}

export function shouldAutoStartMobileOnboardingTour({
  hasLoadedStatus,
  hasSeenV1,
  isActive,
  isAuthenticated,
}: MobileOnboardingTourAutostartState): boolean {
  return hasLoadedStatus && isAuthenticated && !hasSeenV1 && !isActive;
}
