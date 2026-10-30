/** AG1-001: lazy binding to existing diary Core READ implementation. */
import { getDiaryEntries } from "@gafus/core/services/diary";
import { createReadDiaryApplication } from "../application/read-diary.js";

export const readDiaryApplication = createReadDiaryApplication({
  readDiary: (actorUserId, courseId, upToDayOnCourseId) =>
    getDiaryEntries(actorUserId, courseId, upToDayOnCourseId),
});
