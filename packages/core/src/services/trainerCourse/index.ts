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
