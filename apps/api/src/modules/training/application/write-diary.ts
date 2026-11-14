/** Original diary POST write port: Core owns access, validation and upsert. */
type DiaryWriter = (
  actorUserId: string,
  dayOnCourseId: string,
  content: string,
) => Promise<{ success: boolean; error?: string }>;

export function createWriteDiaryApplication(dependencies: { save: DiaryWriter }) {
  return {
    execute(actorUserId: string, dayOnCourseId: string, content: string): ReturnType<DiaryWriter> {
      return dependencies.save(actorUserId, dayOnCourseId, content);
    },
  };
}
