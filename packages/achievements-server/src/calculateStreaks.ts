/** Streaks use local calendar days, not elapsed 24-hour periods. */
const DAY_MS = 86_400_000;

function calendarDay(date: Date): number {
  // Keep the existing local-day policy, but convert its civil components into
  // a UTC ordinal. A DST transition no longer turns one day into 23/25 hours.
  const civil = new Date(0);
  civil.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  return civil.getTime() / DAY_MS;
}

function uniqueDays(trainingDates: readonly (Date | string)[]): Set<number> {
  const days = new Set<number>();
  for (const value of trainingDates) {
    const date = typeof value === "string" ? new Date(value) : value;
    if (!Number.isNaN(date.getTime())) days.add(calendarDay(date));
  }
  return days;
}

/** Today or yesterday must be part of an active streak. Ignore future activity. */
export function calculateCurrentStreak(trainingDates: Date[] | string[]): number {
  const days = uniqueDays(trainingDates);
  const today = calendarDay(new Date());
  let day = days.has(today) ? today : today - 1;
  let streak = 0;
  // The loop is bounded by the number of distinct activity days, not by an
  // arbitrary one-year cap that undercounts long-running streaks.
  while (days.has(day)) {
    streak++;
    day--;
  }
  return streak;
}

/** Longest sequence of consecutive calendar days in the provided history. */
export function calculateLongestStreak(trainingDates: Date[] | string[]): number {
  const sorted = [...uniqueDays(trainingDates)].sort((a, b) => a - b);
  let longest = 0;
  let current = 0;
  let previous: number | undefined;
  for (const day of sorted) {
    current = previous !== undefined && day === previous + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = day;
  }
  return longest;
}
