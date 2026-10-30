/** Existing course personalization command delegates only to injected Core. */
import type { saveCoursePersonalization } from "@gafus/core/services/course";

export function createWriteCoursePersonalizationApplication(dependencies: {
  persist: typeof saveCoursePersonalization;
}) {
  return {
    execute({
      actorUserId,
      courseId,
      payload,
    }: {
      actorUserId: string;
      courseId: string;
      payload: Parameters<typeof saveCoursePersonalization>[2];
    }): ReturnType<typeof saveCoursePersonalization> {
      return dependencies.persist(actorUserId, courseId, payload);
    },
  };
}
