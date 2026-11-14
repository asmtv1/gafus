import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
/** AG1-001: deferred Core READ binding; do not import learner writes here. */
import { getTodayDailyCourse } from "../../daily-course/composition/dailyCourseApplication.js";
import { createReadTodayDailyCourseApplication } from "../application/read-today-daily-course.js";

export const readTodayDailyCourseApplication = createReadTodayDailyCourseApplication({
  readToday: (userId) => withCorrelatedUseCase("learner.daily.today.read", () => getTodayDailyCourse(userId)),
});
