/** Tuesday–Sunday, 14:00 <= MSK < 20:00. Monday is the only day off. */
export function isChatWorkingTime(date: Date): boolean {
  const msk = new Date(date.getTime() + 3 * 3600_000);
  return msk.getUTCDay() !== 1 && msk.getUTCHours() >= 14 && msk.getUTCHours() < 20;
}

/** Five calendar hours, rolled forward into the next working window. */
export function nextChatReminder(from: Date): Date {
  const candidate = new Date(from.getTime() + 5 * 3600_000);
  const msk = new Date(candidate.getTime() + 3 * 3600_000);
  const hour = msk.getUTCHours();
  if (isChatWorkingTime(candidate)) return candidate;
  if (hour >= 20) msk.setUTCDate(msk.getUTCDate() + 1);
  msk.setUTCHours(14, 0, 0, 0);
  while (msk.getUTCDay() === 1) msk.setUTCDate(msk.getUTCDate() + 1);
  return new Date(msk.getTime() - 3 * 3600_000);
}
