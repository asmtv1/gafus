import type { ConsultationSlotDto } from "./types";

import {
  addDaysToConsultationMskDayKey,
  consultationMskDayKey,
  consultationMskDayKeyToDate,
} from "./consultationMskFormat";

export interface ConsultationSlotsByDay {
  dateKey: string;
  slots: ConsultationSlotDto[];
}

/** Дни календаря от from до to (полуночь локально, границы как на web/mobile). */
export function buildConsultationCalendarRangeDays(fromDate: Date, toDate: Date): Date[] {
  const out: Date[] = [];
  let cursorKey = consultationMskDayKey(fromDate);
  const endKey = consultationMskDayKey(toDate);
  while (cursorKey <= endKey) {
    out.push(consultationMskDayKeyToDate(cursorKey));
    cursorKey = addDaysToConsultationMskDayKey(cursorKey, 1);
  }
  return out;
}

/** Исключает слоты в дни выходных кинолога (ключи YYYY-MM-DD). */
export function filterConsultationSlotsExcludingDayOffs(
  slots: ConsultationSlotDto[],
  dayOffDates: Iterable<string>,
): ConsultationSlotDto[] {
  const dayOffSet = dayOffDates instanceof Set ? dayOffDates : new Set(dayOffDates);
  return slots.filter((slot) => {
    const slotDayKey = consultationMskDayKey(new Date(slot.startAtUtc));
    return !dayOffSet.has(slotDayKey);
  });
}

/**
 * Группировка слотов по дням (МСК). Слоты BLOCKED не попадают в группы (как в UI календаря).
 */
export function groupConsultationSlotsByMskDay(slots: ConsultationSlotDto[]): ConsultationSlotsByDay[] {
  const grouped = new Map<string, ConsultationSlotDto[]>();
  for (const slot of slots) {
    if (slot.status === "BLOCKED") continue;
    const start = new Date(slot.startAtUtc);
    const dateKey = consultationMskDayKey(start);
    const bucket = grouped.get(dateKey);
    if (bucket) {
      bucket.push(slot);
    } else {
      grouped.set(dateKey, [slot]);
    }
  }
  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, daySlots]) => ({
      dateKey,
      slots: daySlots.sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc)),
    }));
}
