/** AG1-001: deferred Core READ binding; do not import learner writes here. */
import { getTodayDailyCourse } from "@gafus/core/services/dailyCourse";
import { createReadTodayDailyCourseApplication } from "../application/read-today-daily-course.js";

export const readTodayDailyCourseApplication = createReadTodayDailyCourseApplication({
  readToday: (userId) => getTodayDailyCourse(userId),
});
