/** Keep in sync with the API's validated palette. */
export const CHAT2_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏"] as const;
type Reaction = { emoji: string; count: number; mine: boolean };
export function updateChat2ReactionSummary(
  previous: Reaction[] | undefined, emoji: string, active: boolean,
): Reaction[] {
  const result = (previous ?? []).map((reaction) => ({ ...reaction }));
  for (const reaction of result) {
    if (reaction.mine) { reaction.mine = false; reaction.count -= 1; }
  }
  const target = result.find((reaction) => reaction.emoji === emoji);
  if (active) {
    if (target) { target.mine = true; target.count++; }
    else result.push({ emoji, count: 1, mine: true });
  }
  return result.filter((reaction) => reaction.count > 0);
}
