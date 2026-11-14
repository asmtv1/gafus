/**
 * The one registered SQL snapshot port. Its REPEATABLE READ and live database
 * role checks must not be substituted by independent draft/version GET calls.
 */
import { getCourseEditorSnapshot as coreSnapshot } from "@gafus/core/services/trainerCourse";
import { readCourseEditorSnapshot } from "@gafus/course-read-server/editor-snapshot";

export const getCourseEditorSnapshot = (courseId: string, actor: { id: string; role: string }) =>
  coreSnapshot(courseId, actor, readCourseEditorSnapshot);
