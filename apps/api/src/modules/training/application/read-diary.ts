/** AG1-001: diary GET port only; Hono retains validation, 403 and 500 mapping. */
import type { DiaryEntryWithDay } from "@gafus/core/services/diary";

type DiaryReader = (
  actorUserId: string,
  courseId: string,
  upToDayOnCourseId?: string,
) => Promise<{ entries: DiaryEntryWithDay[]; error?: string }>;

export function createReadDiaryApplication(dependencies: { readDiary: DiaryReader }) {
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
