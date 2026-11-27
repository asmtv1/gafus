/** Existing GET /courses/access chooses the Core lookup; HTTP owns validation. */
import type { CatalogReadService } from "@gafus/core/services/course";

export function createReadCourseAccessApplication(dependencies: {
  byType: CatalogReadService["checkCourseAccess"];
  byId: CatalogReadService["checkCourseAccessById"];
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
    }): ReturnType<CatalogReadService["checkCourseAccess"]> {
      if (courseId) return dependencies.byId(courseId, actorUserId);
      // HTTP route already rejects requests without both identifiers.
      return dependencies.byType(courseType!, actorUserId);
    },
  };
}
