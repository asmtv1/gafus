/** Existing GET /courses/access chooses the Core lookup; HTTP owns validation. */
import type { checkCourseAccess, checkCourseAccessById } from "@gafus/core/services/course";

export function createReadCourseAccessApplication(dependencies: {
  byType: typeof checkCourseAccess;
  byId: typeof checkCourseAccessById;
}) {
  return {
    execute({
      actorUserId,
      courseType,
      courseId,
    }: {
      actorUserId: string;
      courseType?: string;
      courseId?: string;
    }): ReturnType<typeof checkCourseAccess> {
      if (courseId) return dependencies.byId(courseId, actorUserId);
      // HTTP route already rejects requests without both identifiers.
      return dependencies.byType(courseType!, actorUserId);
    },
  };
}
