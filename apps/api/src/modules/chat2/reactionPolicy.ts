

/** Fixed, safe emoji set shared by Web and Mobile. */
export const CHAT2_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏"] as const;

export type Chat2ReactionEmoji = (typeof CHAT2_REACTION_EMOJIS)[number];
