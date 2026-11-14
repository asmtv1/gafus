/** AG1-001: two existing aggregate statistics reads, after Hono access resolution. */
type StatisticsScope = { userId: string; isElevated: boolean };

export function createReadTrainerStatisticsApplication<CourseData, StepData>(dependencies: {
  readCourses: (userId: string, isElevated: boolean) => Promise<unknown>;
  readSteps: (userId: string, isElevated: boolean) => Promise<unknown>;
  projectCourses: (raw: unknown) => CourseData;
  projectSteps: (raw: unknown) => StepData;
}) {
  return {
    async courses({ userId, isElevated }: StatisticsScope): Promise<CourseData> {
      const raw = await dependencies.readCourses(userId, isElevated);
      return dependencies.projectCourses(raw);
    },
    async steps({ userId, isElevated }: StatisticsScope): Promise<StepData> {
      const raw = await dependencies.readSteps(userId, isElevated);
      return dependencies.projectSteps(raw);
    },
  };
}
