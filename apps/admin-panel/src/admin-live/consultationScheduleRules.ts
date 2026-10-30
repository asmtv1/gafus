/** Exactly one editable rule per weekday, matching the legacy Next trainer editor. */
export type AdminWeeklyRule = {
  weekday: number;
  startTime: string;
  endTime: string;
  isWorkingDay: boolean;
};

export function normalizeAdminWeeklyRules(
  input: readonly AdminWeeklyRule[] | null | undefined,
): AdminWeeklyRule[] {
  const byWeekday = new Map(
    (input ?? [])
      .filter((rule) => Number.isInteger(rule.weekday) && rule.weekday >= 0 && rule.weekday <= 6)
      .map((rule) => [rule.weekday, rule] as const),
  );
  return Array.from({ length: 7 }, (_, weekday) => {
    const rule = byWeekday.get(weekday);
    return rule
      ? {
          weekday,
          startTime: rule.startTime,
          endTime: rule.endTime,
          isWorkingDay: rule.isWorkingDay,
        }
      : {
          weekday,
          startTime: "09:00",
          endTime: "18:00",
          isWorkingDay: weekday >= 1 && weekday <= 5,
        };
  });
}
