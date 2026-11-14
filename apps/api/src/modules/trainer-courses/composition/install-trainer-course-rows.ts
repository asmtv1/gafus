import { registerTrainerCourseRowsPort, type TrainerCourseRowsPort } from "@gafus/core/services/trainerCourse";
import {
  createTrainerCourseRow, updateTrainerCourseRows, readCourseRowLogo,
  readCourseRowAuthor, readCourseDraftRow, readCourseRowVisibleAfterStale,
  deleteTrainerCourseRowDependencies, CourseVersionNoMatch,
} from "@gafus/course-progress-server/trainer-course-rows";

/** One authoritative PostgreSQL course-version CAS and its existing rollback. */
const rows: TrainerCourseRowsPort = {
  createRow: createTrainerCourseRow,
  updateRows: updateTrainerCourseRows,
  readLogo: readCourseRowLogo,
  readAuthor: readCourseRowAuthor,
  readDraft: readCourseDraftRow,
  readVisibleAfterStale: readCourseRowVisibleAfterStale,
  deleteDependencies: deleteTrainerCourseRowDependencies,
  isVersionMismatch: (error) => error instanceof CourseVersionNoMatch,
};
registerTrainerCourseRowsPort(rows);
