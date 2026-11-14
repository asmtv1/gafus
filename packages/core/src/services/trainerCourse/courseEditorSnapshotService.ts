import type { CourseDraftDto } from "./trainerCourseService";

/** Core's pure editor snapshot contract; the SQL snapshot is read by the API's
 * course-read-server composition, preserving its REPEATABLE READ transaction
 * and its current-role authorization in the same transaction.
 */
export type CourseEditorSnapshot = CourseDraftDto & { version: number };
export type EditorSnapshotResult =
  | { status: "found"; data: CourseEditorSnapshot }
  | { status: "not_found" | "invalid" | "unknown" };

export type CourseEditorSnapshotPort = (
  courseId: string,
  actor: { id: string; role: string },
) => Promise<EditorSnapshotResult>;

export function getCourseEditorSnapshot(
  courseId: string,
  actor: { id: string; role: string },
  readSnapshot: CourseEditorSnapshotPort,
): Promise<EditorSnapshotResult> {
  return readSnapshot(courseId, actor);
}
