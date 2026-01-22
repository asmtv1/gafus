/**
 * Подсчёт серий занятий по датам тренировок.
 * Общая логика для API и web.
 */

/**
 * Вычисляет текущую серию (дни подряд до последней активности).
 * Если последняя активность — вчера или сегодня, серия продолжается.
 */
export function calculateCurrentStreak(trainingDates: Date[] | string[]): number {
  if (trainingDates.length === 0) return 0;

  const normalizedDates = new Set<string>();
  trainingDates.forEach((date) => {
    const d = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return;
    d.setHours(0, 0, 0, 0);
    normalizedDates.add(d.toISOString());
  });

  if (normalizedDates.size === 0) return 0;

  const uniqueDates = Array.from(normalizedDates)
    .map((iso) => new Date(iso))
    .sort((a, b) => b.getTime() - a.getTime());

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastDate = uniqueDates[0];
  const daysDiff = Math.floor(
    (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysDiff > 1) return 0;

  let streak = 0;
  const expectedDate = new Date(lastDate);
  const dateSet = new Set(uniqueDates.map((d) => d.toISOString()));
  const MAX_ITERATIONS = 365;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const expectedDateStr = expectedDate.toISOString();
    if (dateSet.has(expectedDateStr)) {
      streak++;
      expectedDate.setDate(expectedDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Вычисляет самую длинную серию занятий за всё время.
 */
export function calculateLongestStreak(trainingDates: Date[] | string[]): number {
  if (trainingDates.length === 0) return 0;

  const normalizedDates = new Set<string>();
  trainingDates.forEach((date) => {
    const d = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return;
    d.setHours(0, 0, 0, 0);
    normalizedDates.add(d.toISOString());
  });

  if (normalizedDates.size === 0) return 0;

  const sortedDates = Array.from(normalizedDates)
    .map((iso) => new Date(iso))
    .sort((a, b) => a.getTime() - b.getTime());

  let longestStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = sortedDates[i - 1];
    const currentDate = sortedDates[i];
    const daysDiff = Math.floor(
      (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysDiff === 1) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }
  return longestStreak;
}
