export type ConsultationSlotStatus = "FREE" | "BOOKED" | "BLOCKED";

export type ConsultationBookingStatus =
  | "PENDING_TRAINER_CONFIRMATION"
  | "CONFIRMED"
  | "CANCELLED_BY_TRAINER"
  | "CANCELLED_BY_USER"
  | "CANCELLED_BY_SLA"
  | "CANCELLED_BY_SYSTEM"
  | "COMPLETED"
  | "NO_SHOW";

export type ConsultationPetGender = "MALE" | "FEMALE";

/** Domain email categories are stable across Prisma and the Core mail policy. */
export const CONSULTATION_EMAIL_TYPES = [
  "TRAINER_CONFIRM_REQUEST",
  "CLIENT_BOOKING_RECEIVED",
  "CLIENT_BOOKING_CONFIRMED",
  "TRAINER_BOOKING_CONFIRMED",
  "CLIENT_BOOKING_CANCELLED_BY_TRAINER",
  "TRAINER_BOOKING_CANCELLED_BY_USER",
  "CLIENT_BOOKING_CANCELLED_BY_SLA",
  "CLIENT_BOOKING_VIDEO_FAILED",
  "CLIENT_CONSULTATION_REMINDER_30M",
  "CLIENT_CONSULTATION_START",
  "TRAINER_CONSULTATION_REMINDER_30M",
  "CLIENT_CONSULTATION_NO_SHOW",
] as const;
export type ConsultationEmailType = (typeof CONSULTATION_EMAIL_TYPES)[number];

export interface ListedCynologistCardDto {
  id: string;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  about: string | null;
  slotDurationMin: number;
}

export interface ConsultationSlotDto {
  id: string;
  startAtUtc: string;
  endAtUtc: string;
  status: ConsultationSlotStatus;
}

export interface ConsultationBookingDto {
  id: string;
  status: ConsultationBookingStatus;
  slot: ConsultationSlotDto;
  cynologistUserId: string;
  cynologistDisplayName: string | null;
  clientUsername: string | null;
  clientOwnerName: string | null;
  clientPhone: string | null;
  petName: string | null;
  petGender: ConsultationPetGender | null;
  petAge: string | null;
  petBreed: string | null;
  clientProblem: string | null;
  clientSelfHelpAttempt: string | null;
  cancelReason: string | null;
  confirmationDeadlineAt: string;
  createdAt: string;
}

export type BookSlotResult =
  | { kind: "created"; booking: ConsultationBookingDto }
  | { kind: "idempotent_replay"; booking: ConsultationBookingDto };

export interface ConsultationAvailabilityRuleDto {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  isWorkingDay: boolean;
}

export interface DayOffDto {
  id: string;
  date: string;
  reason: string | null;
}

export interface SlotExceptionDto {
  id: string;
  startAtUtc: string;
  endAtUtc: string;
  reason: string | null;
}
