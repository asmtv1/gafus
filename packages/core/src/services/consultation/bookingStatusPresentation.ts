import type { ConsultationBookingStatus } from "@gafus/prisma";

export type ConsultationStatusTone = "pending" | "success" | "danger" | "neutral";

export interface ConsultationBookingStatusPresentation {
  badge: string;
  description: string;
  tone: ConsultationStatusTone;
  /** Непустой комментарий кинолога при отмене с его стороны (когда передан в options). */
  cancelReason?: string | null;
}

export type ConsultationBookingStatusPresentationOptions = {
  cancelReason?: string | null;
};

/**
 * Тексты статусов брони для экрана «Мои консультации» (не показываем сырые enum).
 */
export function getConsultationBookingStatusPresentation(
  status: ConsultationBookingStatus,
  options?: ConsultationBookingStatusPresentationOptions,
): ConsultationBookingStatusPresentation {
  switch (status) {
    case "PENDING_TRAINER_CONFIRMATION":
      return {
        badge: "Ожидает подтверждения",
        description:
          "Ваша консультация ещё не подтверждена кинологом. Ожидайте подтверждения — на почту придёт уведомление.",
        tone: "pending",
      };
    case "CONFIRMED":
      return {
        badge: "Подтверждена",
        description:
          "Встреча подтверждена. За несколько минут до начала можно перейти по ссылке на видеовстречу.",
        tone: "success",
      };
    case "CANCELLED_BY_TRAINER": {
      const cr = options?.cancelReason?.trim() ?? null;
      return {
        badge: "Отменена кинологом",
        description: "Кинолог отменил эту запись. При необходимости выберите другой слот у кинолога.",
        tone: "danger",
        cancelReason: cr || null,
      };
    }
    case "CANCELLED_BY_USER":
      return {
        badge: "Отменена вами",
        description: "Вы отменили запись на эту консультацию.",
        tone: "neutral",
      };
    case "CANCELLED_BY_SLA":
      return {
        badge: "Отменена по времени",
        description:
          "Запись автоматически отменена: кинолог не подтвердил встречу в отведённый срок. Вы можете записаться снова.",
        tone: "danger",
      };
    case "CANCELLED_BY_SYSTEM":
      return {
        badge: "Отменена системой",
        description: "Запись отменена по техническим причинам. При необходимости оформите новую запись.",
        tone: "danger",
      };
    case "COMPLETED":
      return {
        badge: "Завершена",
        description: "Консультация прошла.",
        tone: "success",
      };
    case "NO_SHOW":
      return {
        badge: "Не состоялась",
        description: "Встреча не состоялась (неявка).",
        tone: "neutral",
      };
  }
}
