/** AG1-001: learner /today delegates one existing Core READ through an injected port. */
import type { getTodayDailyCourse } from "@gafus/core/services/dailyCourse";

type TodayDailyCourseReader = (userId: string) => ReturnType<typeof getTodayDailyCourse>;

export function createReadTodayDailyCourseApplication(dependencies: {
  readToday: TodayDailyCourseReader;
}) {
  return {
    execute(userId: string): ReturnType<TodayDailyCourseReader> {
      return dependencies.readToday(userId);
    },
  };
}
