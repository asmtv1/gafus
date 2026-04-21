import type { ConsultationBookingStatus, ConsultationSlotStatus } from "@gafus/prisma";

export interface ListedCynologistCardDto {
  id: string;
  userId: string;
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
  clientProblem: string | null;
  joinUrl: string | null;
  watchUrl: string | null;
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
