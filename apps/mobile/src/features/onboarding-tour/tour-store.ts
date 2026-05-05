import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { zustandStorage } from "@/shared/stores";
import type { MobileOnboardingTourStepId } from "./tour-steps";

interface MobileOnboardingTourState {
  hasHydrated: boolean;
  hasSeenV1: boolean;
  currentStepId: MobileOnboardingTourStepId;
  isActive: boolean;
  setHasHydrated: (value: boolean) => void;
  startTour: () => void;
  setCurrentStepId: (stepId: MobileOnboardingTourStepId) => void;
  completeTour: () => void;
  skipTour: () => void;
  closeTour: () => void;
}

export const useMobileOnboardingTourStore = create<MobileOnboardingTourState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      hasSeenV1: false,
      currentStepId: "start",
      isActive: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      startTour: () => set({ currentStepId: "start", isActive: true }),
      setCurrentStepId: (stepId) => set({ currentStepId: stepId }),
      completeTour: () => set({ hasSeenV1: true, currentStepId: "finish", isActive: false }),
      skipTour: () => set({ hasSeenV1: true, isActive: false }),
      closeTour: () => set({ isActive: false }),
    }),
    {
      name: "mobile-onboarding-tour",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        hasSeenV1: state.hasSeenV1,
        currentStepId: state.currentStepId,
        isActive: state.isActive,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
