/** Original diary POST write port: Core owns access, validation and upsert. */
import type { saveDiaryEntry } from "@gafus/core/services/diary";

export function createWriteDiaryApplication(dependencies: { save: typeof saveDiaryEntry }) {
  return {
    execute(
      actorUserId: string,
      dayOnCourseId: string,
      content: string,
    ): ReturnType<typeof saveDiaryEntry> {
      return dependencies.save(actorUserId, dayOnCourseId, content);
    },
  };
}
