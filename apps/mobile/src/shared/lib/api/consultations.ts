import type {
  ConsultationBookingDto,
  ConsultationBookingEligibility,
  ConsultationSlotDto,
  ListedCynologistCardDto,
} from "@gafus/consultation-shared";

import { apiClient, type ApiResponse } from "./client";

export type ConsultationsMyResponse = {
  items: ConsultationBookingDto[];
  nextCursor: string | null;
};

export type BookSlotApiResult = {
  kind: "created" | "idempotent_replay";
  booking: ConsultationBookingDto;
};

type BookingEligibilityResponse<T> = ApiResponse<T> & {
  bookingEligibility?: ConsultationBookingEligibility;
};

type SlotsCalendarResponse = BookingEligibilityResponse<ConsultationSlotDto[]> & {
  dayOffDates?: string[];
};

/**
 * Консультации с кинологом (Bearer JWT → apps/api).
 * Сегменты пути с id кодируются (`encodeURIComponent`); бизнес-правила и Zod — на сервере.
 */
export const consultationsApi = {
  listCynologists: (): Promise<BookingEligibilityResponse<ListedCynologistCardDto[]>> =>
    apiClient<ListedCynologistCardDto[]>("/api/v1/consultations/cynologists"),

  getSlots: (
    cynologistUserId: string,
    fromIso: string,
    toIso: string,
  ): Promise<ApiResponse<ConsultationSlotDto[]>> => {
    const q = new URLSearchParams({ from: fromIso, to: toIso });
    return apiClient<ConsultationSlotDto[]>(
      `/api/v1/consultations/cynologists/${encodeURIComponent(cynologistUserId)}/slots?${q}`,
      { suppressSubscriptionPaywall: true },
    );
  },

  /** Календарь как на web: все статусы слотов + выходные кинолога. */
  getSlotsCalendar: async (
    cynologistUserId: string,
    fromIso: string,
    toIso: string,
  ): Promise<SlotsCalendarResponse> => {
    const q = new URLSearchParams({ from: fromIso, to: toIso, includeBusy: "1" });
    const res = await apiClient<ConsultationSlotDto[]>(
      `/api/v1/consultations/cynologists/${encodeURIComponent(cynologistUserId)}/slots?${q}`,
      { suppressSubscriptionPaywall: true },
    );
    return res as SlotsCalendarResponse;
  },

  verifySlotFree: (cynologistUserId: string, slotId: string): Promise<ApiResponse<unknown>> =>
    apiClient(
      `/api/v1/consultations/cynologists/${encodeURIComponent(cynologistUserId)}/slots/${encodeURIComponent(slotId)}/verify`,
      { suppressSubscriptionPaywall: true },
    ),

  book: (body: {
    slotId: string;
    idempotencyKey: string;
    clientOwnerName: string;
    clientPhone: string;
    petName: string;
    petGender: "MALE" | "FEMALE";
    petAge: string;
    petBreed: string;
    clientProblem: string;
    clientSelfHelpAttempt: string;
  }): Promise<ApiResponse<BookSlotApiResult>> =>
    apiClient<BookSlotApiResult>("/api/v1/consultations/book", {
      method: "POST",
      body: {
        slotId: body.slotId,
        idempotencyKey: body.idempotencyKey,
        clientOwnerName: body.clientOwnerName,
        clientPhone: body.clientPhone,
        petName: body.petName,
        petGender: body.petGender,
        petAge: body.petAge,
        petBreed: body.petBreed,
        clientProblem: body.clientProblem,
        clientSelfHelpAttempt: body.clientSelfHelpAttempt,
      },
      suppressSubscriptionPaywall: true,
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
