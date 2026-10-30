/**
 * AG1-001: read-model resolution when a monetized training day is missing.
 * Existing Core controls the day DTO, monetization and optional progress
 * creation; this application only sequences an additional access read on null.
 * Route keeps JWT/validation/platform/status/error response mapping.
 */
import type { checkCourseAccess } from "@gafus/core/services/course";
import type { getTrainingDayWithMonetizedSteps } from "@gafus/core/services/training";

export type TrainingDayReader = typeof getTrainingDayWithMonetizedSteps;
export type CourseAccessReader = typeof checkCourseAccess;

export type ReadTrainingDayCommand = {
  actorUserId: string;
  courseType: string;
  dayOnCourseId: string;
  options: Parameters<TrainingDayReader>[3];
};

export type ReadTrainingDayResult =
  | { kind: "found"; detail: NonNullable<Awaited<ReturnType<TrainingDayReader>>> }
  | { kind: "forbidden" }
  | { kind: "not_found" };

export function createReadTrainingDayApplication(dependencies: {
  readDay: TrainingDayReader;
  checkAccess: CourseAccessReader;
}) {
  return {
    async execute({
      actorUserId,
      courseType,
      dayOnCourseId,
      options,
    }: ReadTrainingDayCommand): Promise<ReadTrainingDayResult> {
      // Keep the established ordering: query the monetized day first and
      // check course access again only if Core returns null.
      const detail = await dependencies.readDay(
        actorUserId, courseType, dayOnCourseId, options,
      );
      // The original Hono route used !result; retain its null/undefined
      // absence behavior, without interpreting legitimate Core DTO fields.
      if (detail) return { kind: "found", detail };

      const access = await dependencies.checkAccess(courseType, actorUserId);
      return access.hasAccess ? { kind: "not_found" } : { kind: "forbidden" };
    },
  };
}
