/** Lazy Core bindings: no onboarding-tour DB read/write at initialization. */
import { getOnboardingTourStatus, markOnboardingTourSeen } from "@gafus/core/services/user";
import { createOnboardingTourApplication } from "../application/onboarding-tour.js";

export const onboardingTourApplication = createOnboardingTourApplication({
  readStatus: (userId) => getOnboardingTourStatus(userId),
  markSeen: (userId) => markOnboardingTourSeen(userId),
});
