/** AG1-001: diary GET port only; Hono retains validation, 403 and 500 mapping. */
import type { getDiaryEntries } from "@gafus/core/services/diary";

type DiaryReader = typeof getDiaryEntries;

export function createReadDiaryApplication(dependencies: {
  readDiary: DiaryReader;
}) {
  return {
    execute({
      actorUserId,
      courseId,
      upToDayOnCourseId,
    }: {
      actorUserId: string;
      courseId: string;
      upToDayOnCourseId?: string;
    }) {
      return dependencies.readDiary(actorUserId, courseId, upToDayOnCourseId);
    },
  };
}
