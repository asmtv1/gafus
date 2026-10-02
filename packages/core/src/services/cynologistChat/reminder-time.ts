/** Five calendar hours, rolled forward into Mon–Fri 09:00 <= MSK < 21:00. */
export function nextChatReminder(from: Date): Date {
  const candidate = new Date(from.getTime() + 5 * 3600_000);
  const msk = new Date(candidate.getTime() + 3 * 3600_000);
  const day = msk.getUTCDay(),
    hour = msk.getUTCHours();
  if (day >= 1 && day <= 5 && hour >= 9 && hour < 21) return candidate;
  if (hour >= 21) msk.setUTCDate(msk.getUTCDate() + 1);
  msk.setUTCHours(9, 0, 0, 0);
  while (msk.getUTCDay() === 0 || msk.getUTCDay() === 6) msk.setUTCDate(msk.getUTCDate() + 1);
  return new Date(msk.getTime() - 3 * 3600_000);
}
