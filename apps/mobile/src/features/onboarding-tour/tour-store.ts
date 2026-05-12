import { create } from "zustand";

import type { MobileOnboardingTourStepId } from "./tour-steps";

interface MobileOnboardingTourState {
  hasHydrated: boolean;
  hasSeenV1: boolean;
  currentStepId: MobileOnboardingTourStepId;
  isActive: boolean;
  isAwaitingRequiredPetCreation: boolean;
  setHasSeenV1: (value: boolean) => void;
  setHasHydrated: (value: boolean) => void;
  startTour: () => void;
  setCurrentStepId: (stepId: MobileOnboardingTourStepId) => void;
  waitForRequiredPetCreation: () => void;
  completeRequiredPetCreation: () => void;
  cancelRequiredPetCreationWait: () => void;
  completeTour: () => void;
  skipTour: () => void;
  closeTour: () => void;
}

export const useMobileOnboardingTourStore = create<MobileOnboardingTourState>((set) => ({
  hasHydrated: false,
  hasSeenV1: false,
  currentStepId: "start",
  isActive: false,
  isAwaitingRequiredPetCreation: false,
  setHasSeenV1: (value) => set({ hasSeenV1: value }),
  setHasHydrated: (value) => set({ hasHydrated: value }),
  startTour: () =>
    set({
      currentStepId: "start",
      isActive: true,
      isAwaitingRequiredPetCreation: false,
    }),
  setCurrentStepId: (stepId) =>
    set({
      currentStepId: stepId,
      isAwaitingRequiredPetCreation: false,
    }),
  waitForRequiredPetCreation: () => set({ isAwaitingRequiredPetCreation: true }),
  completeRequiredPetCreation: () =>
    set({
      currentStepId: "prevention",
      isActive: true,
      isAwaitingRequiredPetCreation: false,
    }),
  cancelRequiredPetCreationWait: () => set({ isAwaitingRequiredPetCreation: false }),
  completeTour: () =>
    set({
      hasSeenV1: true,
      currentStepId: "finish",
      isActive: false,
      isAwaitingRequiredPetCreation: false,
    }),
  skipTour: () =>
    set({
      hasSeenV1: true,
      isActive: false,
      isAwaitingRequiredPetCreation: false,
    }),
  closeTour: () => set({ isActive: false, isAwaitingRequiredPetCreation: false }),
}));
