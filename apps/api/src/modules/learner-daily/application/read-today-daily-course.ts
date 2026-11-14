/** AG1-001: learner /today delegates one existing Core READ through an injected port. */
import type { createDailyCourseService } from "@gafus/course-progress-server/daily-course-service";

/** The owning server factory supplies the callable shape, never a runtime import. */
type TodayDailyCourseReader = ReturnType<typeof createDailyCourseService>["getTodayDailyCourse"];

export function createReadTodayDailyCourseApplication(dependencies: {
  readToday: TodayDailyCourseReader;
}) {
  return {
    execute(userId: string): ReturnType<TodayDailyCourseReader> {
      return dependencies.readToday(userId);
    },
  };
}
