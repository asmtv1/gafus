import type { TrainerCourseRowsPort } from "@gafus/core/services/trainerCourse";
/** AG1-001/TR012: lazy bindings to the original Core draft/snapshot readers. */
import { getCourseDraftWithRelations } from "@gafus/core/services/trainerCourse";
import { getCourseEditorSnapshot } from "./editor-snapshot-port.js";
import { createReadCourseEditorApplication } from "../application/read-course-editor.js";

export const readCourseEditorApplication = createReadCourseEditorApplication({
  readDraft: (courseId, actorUserId, options) =>
    getCourseDraftWithRelations(courseId, actorUserId, options),
  readEditorSnapshot: (courseId, actor) => getCourseEditorSnapshot(courseId, actor),
});

/** Per-application draft read remains owner-scoped, never obtains SQL globally. */
export function createReadCourseEditorApplicationForRows(rowsPort: TrainerCourseRowsPort) {
  return createReadCourseEditorApplication({
    readDraft: (courseId, actorUserId, options) =>
      getCourseDraftWithRelations(courseId, actorUserId, options, rowsPort),
    readEditorSnapshot: (courseId, actor) => getCourseEditorSnapshot(courseId, actor),
  });
}
