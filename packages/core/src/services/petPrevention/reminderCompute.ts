/**
 * Расчёт remindAt для журнала профилактики.
 * remindAt — календарный день (UTC), по нему воркер выбирает записи для push.
 */

export type PetPreventionTypeKey = "VACCINATION" | "DEWORMING" | "TICKS_FLEAS";

export const DEFAULT_REMINDER_DAYS: Record<PetPreventionTypeKey, number> = {
  VACCINATION: 365,
  DEWORMING: 90,
  TICKS_FLEAS: 30,
};

/** Начало календарного дня в UTC (для согласованного хранения @db.Date). */
export function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addUtcDays(base: Date, days: number): Date {
  const x = utcDayStart(base);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

export interface ReminderState {
  reminderEnabled: boolean;
  reminderKind: "AFTER_DAYS" | "ON_DATE";
  reminderDaysAfter: number | null;
  reminderOnDate: Date | null;
}

export interface ComputedReminder extends ReminderState {
  remindAt: Date | null;
}

/**
 * Считает remindAt и нормализует поля напоминания для записи в БД.
 */
export function computeReminderFields(params: {
  performedAt: Date;
  type: PetPreventionTypeKey;
} & ReminderState): ComputedReminder {
  if (!params.reminderEnabled) {
    return {
      reminderEnabled: false,
      reminderKind: params.reminderKind,
      reminderDaysAfter: null,
      reminderOnDate: null,
      remindAt: null,
    };
  }

  if (params.reminderKind === "AFTER_DAYS") {
    const days =
      params.reminderDaysAfter ?? DEFAULT_REMINDER_DAYS[params.type];
    const performedDay = utcDayStart(params.performedAt);
    const remindAt = addUtcDays(performedDay, days);
    return {
      reminderEnabled: true,
      reminderKind: "AFTER_DAYS",
      reminderDaysAfter: days,
      reminderOnDate: null,
      remindAt,
    };
  }

  if (!params.reminderOnDate) {
    throw new Error("Укажите дату напоминания");
  }

  const remindAt = utcDayStart(params.reminderOnDate);
  return {
    reminderEnabled: true,
    reminderKind: "ON_DATE",
    reminderDaysAfter: null,
    reminderOnDate: remindAt,
    remindAt,
  };
}
