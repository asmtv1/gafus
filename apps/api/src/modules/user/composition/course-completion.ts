/** Persistence composition for the pure Core course-completion policy. */
import {
  completeUserCourseRecord,
  completeExistingUserCourseRecord,
  countCourseDays,
  readCourseDayIds,
  readOwnTrainingStatuses,
} from "@gafus/course-progress-server/completion";
import { createUserCourseService } from "@gafus/core/services/user";

export const {
  completeUserCourse,
  getDaysCountForCourse,
  getUserTrainingsForDays,
  checkAndCompleteCourse,
} = createUserCourseService({
  completeUserCourseRecord,
  completeExistingUserCourseRecord,
  countCourseDays,
  readCourseDayIds,
  readOwnTrainingStatuses,
});
