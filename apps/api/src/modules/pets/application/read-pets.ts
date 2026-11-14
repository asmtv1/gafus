/** Pure pet READ orchestration; all data projections are injected by API composition. */
export function createReadPetsApplication<ListItem, DetailItem>(dependencies: {
  readList: (actorUserId: string, options: { throwOnError: boolean }) => Promise<ListItem[]>;
  readDetail: (petId: string, actorUserId: string) => Promise<DetailItem | null>;
}) {
  return {
    list({ actorUserId }: { actorUserId: string }) {
      return dependencies.readList(actorUserId, { throwOnError: true });
    },
    detail({ petId, actorUserId }: { petId: string; actorUserId: string }) {
      return dependencies.readDetail(petId, actorUserId);
    },
  };
}
