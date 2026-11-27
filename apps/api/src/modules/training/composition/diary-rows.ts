import { checkCourseAccessById } from "../../courses/composition/catalog-read-instance.js";
/** Server-only SQL composition for the existing Core diary domain policies. */
import {
  getDiaryEntries as readCoreDiary,
  saveDiaryEntry as writeCoreDiary,
  type DiaryPersistencePort,
} from "@gafus/core/services/diary";
import {
  resolveDiaryCourseId,
  readDiaryDayOccurrence,
  writeDiaryUserDay,
  readDiaryCourseEntries,
} from "@gafus/course-progress-server/diary-entries";

export const diaryPersistence: DiaryPersistencePort = {
  resolveDiaryCourseId,
  readDiaryDayOccurrence,
  writeDiaryUserDay,
  readDiaryCourseEntries,
};
export const getDiaryEntries = (userId: string, courseId: string, upToDayOnCourseId?: string) =>
  readCoreDiary(diaryPersistence, checkCourseAccessById, userId, courseId, upToDayOnCourseId);
export const saveDiaryEntry = (userId: string, dayOnCourseId: string, content: string) =>
  writeCoreDiary(diaryPersistence, checkCourseAccessById, userId, dayOnCourseId, content);
