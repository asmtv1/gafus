import { ServiceError } from "../../errors/ServiceError";

/** Слот уже занят другим клиентом (optimistic lock). */
export class ConsultationSlotTakenError extends ServiceError {
  constructor() {
    super("Слот уже занят", "CONSULTATION_SLOT_TAKEN", 409);
    this.name = "ConsultationSlotTakenError";
  }
}

/** Нет прав на операцию с консультацией. */
export class ConsultationForbiddenError extends ServiceError {
  constructor(message = "Недостаточно прав") {
    super(message, "CONSULTATION_FORBIDDEN", 403);
    this.name = "ConsultationForbiddenError";
  }
}

/** The active plan permits course access but does not include new consultations. */
export class ConsultationBookingNotIncludedError extends ServiceError {
  constructor() {
    super(
      "Запись к кинологу доступна в тарифах от 1 месяца",
      "CONSULTATION_BOOKING_NOT_INCLUDED",
      403,
    );
    this.name = "ConsultationBookingNotIncludedError";
  }
}

/** Не удалось создать конференцию в Яндекс Телемост. */
export class TelemostUnavailableError extends ServiceError {
  constructor(message = "Недоступна видеоконференция") {
    super(message, "TELEMOST_UNAVAILABLE", 503);
    this.name = "TelemostUnavailableError";
  }
}

/** Сущность не найдена (консультация, слот, кинолог). */
export class ConsultationNotFoundError extends ServiceError {
  constructor(resource: string) {
    super(`${resource} не найден`, "CONSULTATION_NOT_FOUND", 404);
    this.name = "ConsultationNotFoundError";
  }
}
