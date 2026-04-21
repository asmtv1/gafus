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
 * Консультации с кинологом (apps/api, JWT).
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

  book: (
    slotId: string,
    idempotencyKey: string,
  ): Promise<ApiResponse<BookSlotApiResult>> =>
    apiClient<BookSlotApiResult>("/api/v1/consultations/book", {
      method: "POST",
      body: { slotId, idempotencyKey },
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
