export type ConsultationBookingEligibility = {
  canBook: boolean;
  reason: "ACTIVE_BOOKING" | "WEEKLY_COOLDOWN" | null;
  nextBookingAt: string | null;
  message: string | null;
};

export function consultationWeeklyCooldownMessage(nextBookingAt: string): string {
  const date = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(nextBookingAt));
  return `Видеоконсультации доступны не чаще одного раза в неделю. Пожалуйста, дождитесь окончания этого срока. Вы сможете забронировать следующую консультацию ${date} (МСК).`;
}

export const CONSULTATION_ACTIVE_BOOKING_MESSAGE =
  "У вас уже есть заявка или подтверждённая видеоконсультация. Одновременно доступна только одна бронь. Посмотреть её можно в разделе «Мои консультации».";

/** Deterministic booking policy, independent of Core and PostgreSQL. */
export const CONSULTATION_BOOKING_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export type ConsultationBookingRestrictions = {
  hasActiveBooking: boolean;
  lastCompletedAt: Date | null;
};
export function evaluateConsultationBookingRestrictions(
  restrictions: ConsultationBookingRestrictions,
  now = new Date(),
): ConsultationBookingEligibility {
  if (restrictions.hasActiveBooking) {
    return { canBook: false, reason: "ACTIVE_BOOKING", nextBookingAt: null,
      message: CONSULTATION_ACTIVE_BOOKING_MESSAGE };
  }
  if (restrictions.lastCompletedAt) {
    const next = new Date(restrictions.lastCompletedAt.getTime() + CONSULTATION_BOOKING_COOLDOWN_MS);
    if (now < next) {
      const nextBookingAt = next.toISOString();
      return { canBook: false, reason: "WEEKLY_COOLDOWN", nextBookingAt,
        message: consultationWeeklyCooldownMessage(nextBookingAt) };
    }
  }
  return { canBook: true, reason: null, nextBookingAt: null, message: null };
}
