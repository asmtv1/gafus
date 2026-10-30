import {
  addDaysToConsultationMskDayKey,
  consultationMskDayKey,
  formatConsultationConfirmSlotMsk,
  formatConsultationDayLabelMsk,
} from "@gafus/consultation-shared/consultation-msk-format";

export type EditableSlot = {
  id: string;
  startAtUtc: string;
  endAtUtc: string;
  status: "FREE";
};

/** Legacy Next calendar: today (Moscow) through 14 days ahead, inclusive. */
export function editableScheduleRangeMsk(now = new Date()) {
  const first = consultationMskDayKey(now);
  const last = addDaysToConsultationMskDayKey(first, 14);
  return {
    fromUtc: new Date(`${first}T00:00:00.000+03:00`).toISOString(),
    toUtc: new Date(`${last}T23:59:59.999+03:00`).toISOString(),
    firstDayKey: first,
    lastDayKey: last,
  };
}

export function groupEditableSlotsByMskDay(slots: EditableSlot[]): {
  date: string;
  label: string;
  slots: EditableSlot[];
}[] {
  const grouped = new Map<string, EditableSlot[]>();
  for (const slot of slots) {
    if (
      slot.status !== "FREE" ||
      !Number.isFinite(new Date(slot.startAtUtc).getTime()) ||
      !Number.isFinite(new Date(slot.endAtUtc).getTime()) ||
      new Date(slot.startAtUtc).getTime() >= new Date(slot.endAtUtc).getTime()
    )
      continue;
    const key = consultationMskDayKey(new Date(slot.startAtUtc));
    grouped.set(key, [...(grouped.get(key) ?? []), slot]);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({
      date,
      label: formatConsultationDayLabelMsk(new Date(`${date}T12:00:00.000+03:00`)),
      slots: rows.sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc)),
    }));
}

export function readableSlotMsk(slot: EditableSlot): string {
  return formatConsultationConfirmSlotMsk(slot.startAtUtc, slot.endAtUtc);
}

export function editableScheduleDaysMsk(now = new Date()) {
  const start = editableScheduleRangeMsk(now).firstDayKey;
  return Array.from({ length: 15 }, (_, index) => {
    const date = addDaysToConsultationMskDayKey(start, index);
    return { date, label: formatConsultationDayLabelMsk(new Date(`${date}T12:00:00.000+03:00`)) };
  });
}
