/**
 * Per-occurrence Gafus rights policy. The caller binds owner-scoped reads
 * and grant validation in composition; Core must not open SQL connections.
 * Do not substitute progress rows for the purchased course occurrence: a
 * paid video can legitimately be viewed before a UserStep is created.
 */
export type GafusGrantLookup = {
  userId: string;
  dayOnCourseId: string;
  stepOnDayId: string;
  now?: Date;
};

export interface GafusInteropPorts {
  readUserStepOccurrence(userStepId: string, actorUserId: string): Promise<{
    userTraining: { dayOnCourseId: string | null } | null;
    stepOnDayId: string;
  } | null>;
  readVideoOccurrences(videoUrl: string): Promise<readonly {
    id: string;
    day: { stepLinks: readonly { id: string }[] };
  }[]>;
  hasActiveCourseStepGrant(input: GafusGrantLookup): Promise<boolean>;
}

type AccessRequest = { userId: string; now?: Date };

export function createGafusInteropService(ports: GafusInteropPorts) {
  async function hasGafusUnlockForUserStep(
    input: AccessRequest & { userStepId: string },
  ): Promise<boolean> {
    if (!input.userId || !input.userStepId) return false;
    const step = await ports.readUserStepOccurrence(input.userStepId, input.userId);
    if (!step?.userTraining?.dayOnCourseId) return false;
    return ports.hasActiveCourseStepGrant({
      userId: input.userId,
      dayOnCourseId: step.userTraining.dayOnCourseId,
      stepOnDayId: step.stepOnDayId,
      now: input.now,
    });
  }

  /** Verify the exact video-linked occurrence; no ownership is inferred from URL alone. */
  async function findGafusUnlockedStepForVideoUrl(
    input: AccessRequest & { videoUrl: string },
  ): Promise<string | null> {
    if (!input.userId || !input.videoUrl) return null;
    const occurrences = await ports.readVideoOccurrences(input.videoUrl);
    for (const occurrence of occurrences) {
      for (const step of occurrence.day.stepLinks) {
        if (await ports.hasActiveCourseStepGrant({
          userId: input.userId,
          dayOnCourseId: occurrence.id,
          stepOnDayId: step.id,
          now: input.now,
        })) return step.id;
      }
    }
    return null;
  }

  async function hasGafusUnlockForVideoUrl(input: AccessRequest & { videoUrl: string }) {
    return (await findGafusUnlockedStepForVideoUrl(input)) !== null;
  }

  return {
    hasGafusUnlockForUserStep,
    findGafusUnlockedStepForVideoUrl,
    hasGafusUnlockForVideoUrl,
  };
}
