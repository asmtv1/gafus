import { create } from "zustand";

import type { WebOnboardingTourStepId } from "./tour-steps";

interface WebOnboardingTourState {
  hasSeenV1: boolean;
  hasServerStateLoaded: boolean;
  currentStepId: WebOnboardingTourStepId;
  isActive: boolean;
  isAwaitingRequiredPetCreation: boolean;
  setServerState: (hasSeenV1: boolean) => void;
  startTour: () => void;
  setCurrentStepId: (stepId: WebOnboardingTourStepId) => void;
  waitForRequiredPetCreation: () => void;
  completeRequiredPetCreation: () => void;
  cancelRequiredPetCreationWait: () => void;
  completeTour: () => void;
  skipTour: () => void;
  closeTour: () => void;
}

export const useWebOnboardingTourStore = create<WebOnboardingTourState>((set) => ({
  hasSeenV1: false,
  hasServerStateLoaded: false,
  currentStepId: "start",
  isActive: false,
  isAwaitingRequiredPetCreation: false,
  setServerState: (hasSeenV1) => set({ hasSeenV1, hasServerStateLoaded: true }),
  startTour: () =>
    set({ currentStepId: "start", isActive: true, isAwaitingRequiredPetCreation: false }),
  setCurrentStepId: (stepId) =>
    set({ currentStepId: stepId, isAwaitingRequiredPetCreation: false }),
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
