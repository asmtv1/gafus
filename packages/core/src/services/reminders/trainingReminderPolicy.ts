/** Pure per-user training-reminder scheduling policy (timezone-aware). */
export const TRAINING_REMINDER_TIME_TOLERANCE_MINUTES = 5;

export interface TrainingReminderLocalTime {
  hour: number;
  minute: number;
  dayOfWeek: number;
  year: number;
  month: number;
  day: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function localParts(timezone: string, now: Date, withTime: boolean) {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false } : {}),
  };
  try {
    return new Intl.DateTimeFormat("en-US", options).formatToParts(now);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).formatToParts(now);
  }
}

export function getTrainingReminderLocalTime(timezone: string, now = new Date()): TrainingReminderLocalTime {
  const parts = localParts(timezone, now, true);
  const get = (name: string) => parts.find(part => part.type === name)?.value ?? "0";
  const h = Number(get("hour"));
  const weekday = WEEKDAYS.indexOf(get("weekday") as (typeof WEEKDAYS)[number]);
  return {
    hour: h === 24 ? 0 : h,
    minute: Number(get("minute")),
    dayOfWeek: weekday < 0 ? 0 : weekday,
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

export function trainingReminderMatchesDay(reminderDays: string | null, dayOfWeek: number): boolean {
  if (!reminderDays) return true;
  const day = dayOfWeek === 0 ? 7 : dayOfWeek;
  return reminderDays.split(",").map(s => s.trim()).filter(Boolean).includes(String(day));
}

export function trainingReminderMatchesTime(reminderTime: string, hour: number, minute: number): boolean {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(reminderTime);
  if (!match) return false;
  return Math.abs((Number(match[1]) * 60 + Number(match[2])) - (hour * 60 + minute))
    <= TRAINING_REMINDER_TIME_TOLERANCE_MINUTES;
}

export function trainingReminderAlreadySentToday(
  lastSentAt: Date | null,
  timezone: string,
  local: Pick<TrainingReminderLocalTime, "year" | "month" | "day">,
): boolean {
  if (!lastSentAt) return false;
  const parts = localParts(timezone, lastSentAt, false);
  const val = (name: string) => Number(parts.find(part => part.type === name)?.value ?? "0");
  return val("year") === local.year && val("month") === local.month && val("day") === local.day;
}

export function shouldSendTrainingReminder(input: {
  timezone: string;
  reminderDays: string | null;
  reminderTime: string;
  lastSentAt: Date | null;
}, now = new Date()): boolean {
  const local = getTrainingReminderLocalTime(input.timezone, now);
  return trainingReminderMatchesDay(input.reminderDays, local.dayOfWeek) &&
    trainingReminderMatchesTime(input.reminderTime, local.hour, local.minute) &&
    !trainingReminderAlreadySentToday(input.lastSentAt, input.timezone, local);
}
