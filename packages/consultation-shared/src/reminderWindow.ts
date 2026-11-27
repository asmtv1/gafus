/** A delayed or replayed queue job must never announce an old meeting.
 * The 30-minute reminder may be late, but only before the slot begins;
 * the start reminder may be late, but only during the actual slot.
 */
export function isConsultationReminderDue(
  slot: { startAt: Date; endAt: Date },
  kind: "30m" | "start",
  now: Date,
): boolean {
  const start = slot.startAt.getTime();
  const end = slot.endAt.getTime();
  const time = now.getTime();
  if (![start, end, time].every(Number.isFinite) || end <= start) return false;
  return kind === "30m"
    ? time >= start - 30 * 60_000 && time < start
    : time >= start && time < end;
}

export type ConsultationReminderPushKey = `${"30m" | "start"}-${"client" | "trainer"}`;
export interface ConsultationReminderPush {
  bookingId: string;
  key: ConsultationReminderPushKey;
}


export function consultationEmailReminderKind(type: string): "30m" | "start" | null {
  if (type === "CLIENT_CONSULTATION_START") return "start";
  if (type === "CLIENT_CONSULTATION_REMINDER_30M" || type === "TRAINER_CONSULTATION_REMINDER_30M") return "30m";
  return null;
}
