/**
 * Read-only inbox policy projections, independent of Prisma and HTTP handlers.
 * The caller must already have actor-scoped memberships; these helpers never
 * authorize opening a room or sending a message.
 */
type DirectMember = { userId: string };
type InboxItem = {
  conversation: { kind: string; members: readonly DirectMember[] };
};
export type BlockPair = { blockerId: string; blockedId: string };

/** Bounded by the upstream inbox `take: 100`; deduplicate repeated peers. */
export function collectDirectInboxPeerIds(items: readonly InboxItem[], actorId: string): string[] {
  const peers = new Set<string>();
  for (const item of items) {
    if (item.conversation.kind !== "DIRECT") continue;
    const other = item.conversation.members.find(member => member.userId !== actorId);
    if (other?.userId) peers.add(other.userId);
  }
  return [...peers];
}

/** Both directions hide the direct room. Ignore pairs unrelated to this actor. */
export function collectBlockedDirectPeerIds(
  actorId: string, rows: readonly BlockPair[],
): Set<string> {
  const peers = new Set<string>();
  for (const row of rows) {
    if (row.blockerId === actorId) peers.add(row.blockedId);
    else if (row.blockedId === actorId) peers.add(row.blockerId);
  }
  return peers;
}
