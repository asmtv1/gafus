import type {
  ConsultationBookingDto,
  ConsultationSlotDto,
  ListedCynologistCardDto,
} from "@gafus/core";

import { apiClient, type ApiResponse } from "./client";

export type ConsultationsMyResponse = {
  items: ConsultationBookingDto[];
  nextCursor: string | null;
};

export type BookSlotApiResult = {
  kind: "created" | "idempotent_replay";
  booking: ConsultationBookingDto;
};

/**
 * Консультации с кинологом (Bearer JWT → apps/api).
 * Сегменты пути с id кодируются (`encodeURIComponent`); бизнес-правила и Zod — на сервере.
 */
export const consultationsApi = {
  listCynologists: (): Promise<ApiResponse<ListedCynologistCardDto[]>> =>
    apiClient<ListedCynologistCardDto[]>("/api/v1/consultations/cynologists"),

  getSlots: (
    cynologistUserId: string,
    fromIso: string,
    toIso: string,
  ): Promise<ApiResponse<ConsultationSlotDto[]>> => {
    const q = new URLSearchParams({ from: fromIso, to: toIso });
    return apiClient<ConsultationSlotDto[]>(
      `/api/v1/consultations/cynologists/${encodeURIComponent(cynologistUserId)}/slots?${q}`,
    );
  },

  /** Календарь как на web: все статусы слотов + выходные кинолога. */
  getSlotsCalendar: async (
    cynologistUserId: string,
    fromIso: string,
    toIso: string,
  ): Promise<ApiResponse<ConsultationSlotDto[]> & { dayOffDates?: string[] }> => {
    const q = new URLSearchParams({ from: fromIso, to: toIso, includeBusy: "1" });
    const res = await apiClient<ConsultationSlotDto[]>(
      `/api/v1/consultations/cynologists/${encodeURIComponent(cynologistUserId)}/slots?${q}`,
    );
    return res as ApiResponse<ConsultationSlotDto[]> & { dayOffDates?: string[] };
  },

  verifySlotFree: (cynologistUserId: string, slotId: string): Promise<ApiResponse<unknown>> =>
    apiClient(`/api/v1/consultations/cynologists/${encodeURIComponent(cynologistUserId)}/slots/${encodeURIComponent(slotId)}/verify`),

  book: (
    slotId: string,
    idempotencyKey: string,
    clientProblem?: string,
  ): Promise<ApiResponse<BookSlotApiResult>> =>
    apiClient<BookSlotApiResult>("/api/v1/consultations/book", {
      method: "POST",
      body: {
        slotId,
        idempotencyKey,
        ...(clientProblem?.trim() ? { clientProblem: clientProblem.trim() } : {}),
      },
    }),

  myBookings: (cursor?: string): Promise<ApiResponse<ConsultationsMyResponse>> => {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return apiClient<ConsultationsMyResponse>(`/api/v1/consultations/my${q}`);
  },

  cancelBooking: (bookingId: string): Promise<ApiResponse<{ bookingId: string }>> =>
    apiClient<{ bookingId: string }>(
      `/api/v1/consultations/bookings/${encodeURIComponent(bookingId)}/cancel`,
      { method: "POST", body: {} },
    ),
};
