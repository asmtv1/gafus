export {
  createCourse,
  updateCourse,
  deleteCourse,
  canCreatePaidCourse,
  getCourseDraftWithRelations,
  trainerCanEditCourse,
} from "./trainerCourseService";
export type {
  CourseDraftDto,
  DeleteCourseResult,
} from "./trainerCourseService";
export {
  createTrainerCourseSchema,
  updateTrainerCourseSchema,
} from "./schemas";
export type {
  CreateTrainerCourseInput,
  UpdateTrainerCourseInput,
} from "./schemas";

// AG1 Course.version: database-trigger-owned global revision, name-only CAS.
export { readCourseNameVersion, updateCourseNameVersioned } from "./courseVersionService";
export { registerCourseVersionRowsPort } from "./courseVersionService";
export type { CourseVersionRowsPort } from "./courseVersionService";
export type { VersionedName, CourseVersionActor, CourseVersionResult } from "./courseVersionService";

// TR012 atomic edit snapshot: strict single versioned observation.
export { getCourseEditorSnapshot } from "./courseEditorSnapshotService";
export { createCourseVersionedDeleter } from "./courseDeleteVersionedService";
export type { CourseEditorSnapshot, EditorSnapshotResult } from "./courseEditorSnapshotService";
export { createTrainerCourseNameOnlyService } from "./trainerCourseNameOnlyService";

export { registerTrainerCourseRowsPort } from "./trainerCourseRowsPort";
export type { TrainerCourseRowsPort } from "./trainerCourseRowsPort";
