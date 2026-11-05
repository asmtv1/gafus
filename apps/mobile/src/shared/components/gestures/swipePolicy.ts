/** Stable gesture thresholds, independent from navigation and native view state. */
export function shouldCloseSheet(translationY: number, velocityY: number) {
  "worklet";
  return translationY > 90 || (translationY > 35 && velocityY > 900);
}

export const CHAT_TABS = ["all", "direct", "group", "unread"] as const;
export type ChatTab = typeof CHAT_TABS[number];

export function nextChatTab(current: ChatTab, dx: number, dy: number): ChatTab {
  if (Math.abs(dx) < 85 || Math.abs(dx) < Math.abs(dy) * 1.5) return current;
  const index = CHAT_TABS.indexOf(current);
  return CHAT_TABS[Math.max(0, Math.min(CHAT_TABS.length - 1, index + (dx < 0 ? 1 : -1)))];
}

export function shouldReplyToSwipe(dx: number, dy: number, velocityX: number) {
  "worklet";
  return dx > 85 && Math.abs(dy) < 55 && velocityX > -200;
}
