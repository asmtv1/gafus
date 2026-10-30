/** Existing user onboarding-tour GET and complete commands via injected Core ports. */
import type { getOnboardingTourStatus, markOnboardingTourSeen } from "@gafus/core/services/user";

export function createOnboardingTourApplication(dependencies: {
  readStatus: typeof getOnboardingTourStatus;
  markSeen: typeof markOnboardingTourSeen;
}) {
  return {
    getStatus(actorUserId: string): ReturnType<typeof getOnboardingTourStatus> {
      return dependencies.readStatus(actorUserId);
    },
    complete(actorUserId: string): ReturnType<typeof markOnboardingTourSeen> {
      return dependencies.markSeen(actorUserId);
    },
  };
}
