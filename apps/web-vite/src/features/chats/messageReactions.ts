/** Match the validated Chat 2.0 server palette. */
export const CHAT2_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏"] as const;
export type Chat2Reaction = { emoji: string; count: number; mine: boolean };

/** Locally update older (paginated) messages after a confirmed mutation. */
export function updateChat2ReactionSummary(
  previous: Chat2Reaction[] | undefined, emoji: string, active: boolean,
): Chat2Reaction[] {
  const result = (previous ?? []).map((reaction) => ({ ...reaction }));
  for (const reaction of result) {
    if (!reaction.mine) continue;
    reaction.mine = false;
    reaction.count -= 1;
  }
  const target = result.find((reaction) => reaction.emoji === emoji);
  if (active) {
    if (target) {
      target.mine = true;
      target.count += 1;
    } else {
      result.push({ emoji, count: 1, mine: true });
    }
  }
  return result.filter((reaction) => reaction.count > 0);
}
