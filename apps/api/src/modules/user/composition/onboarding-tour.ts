import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
/** Lazy Core bindings: no onboarding-tour DB read/write at initialization. */
import { getOnboardingTourStatus, markOnboardingTourSeen } from "@gafus/core/services/user";
import { profileRows } from "./profile-rows-instance.js";
import { createOnboardingTourApplication } from "../application/onboarding-tour.js";

export const onboardingTourApplication = createOnboardingTourApplication({
  readStatus: (userId) => withCorrelatedUseCase("user.onboarding_tour.status.read", () => getOnboardingTourStatus(userId, profileRows)),
  markSeen: (userId) => withCorrelatedUseCase("user.onboarding_tour.seen.update", () => markOnboardingTourSeen(userId, profileRows)),
});
