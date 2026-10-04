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
