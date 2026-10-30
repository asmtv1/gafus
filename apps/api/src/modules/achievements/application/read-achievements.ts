/** AG1-001: achievement READ ports are provider-agnostic; Hono owns responses. */
export function createReadAchievementsApplication<TStats, TDates extends Date[]>(
  dependencies: {
    readStats: (actorUserId: string) => Promise<TStats>;
    readTrainingDates: (actorUserId: string) => Promise<TDates>;
  },
) {
  return {
    stats({ actorUserId }: { actorUserId: string }) {
      return dependencies.readStats(actorUserId);
    },
    trainingDates({ actorUserId }: { actorUserId: string }) {
      return dependencies.readTrainingDates(actorUserId);
    },
  };
}
