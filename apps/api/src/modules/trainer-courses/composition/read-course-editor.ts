/** AG1-001/TR012: lazy bindings to the original Core draft/snapshot readers. */
import {
  getCourseDraftWithRelations,
  getCourseEditorSnapshot,
} from "@gafus/core/services/trainerCourse";
import { createReadCourseEditorApplication } from "../application/read-course-editor.js";

export const readCourseEditorApplication = createReadCourseEditorApplication({
  readDraft: (courseId, actorUserId, options) =>
    getCourseDraftWithRelations(courseId, actorUserId, options),
  readEditorSnapshot: (courseId, actor) => getCourseEditorSnapshot(courseId, actor),
});
