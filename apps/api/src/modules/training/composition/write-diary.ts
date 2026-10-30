/** Lazy binding to original diary Core POST; no write during creation. */
import { saveDiaryEntry } from "@gafus/core/services/diary";
import { createWriteDiaryApplication } from "../application/write-diary.js";

export const writeDiaryApplication = createWriteDiaryApplication({
  save: (actorUserId, dayOnCourseId, content) =>
    saveDiaryEntry(actorUserId, dayOnCourseId, content),
});
