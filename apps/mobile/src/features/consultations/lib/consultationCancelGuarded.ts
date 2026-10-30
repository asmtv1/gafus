import { apiClient, type ApiResponse } from "@/shared/lib/api/client";

/** Existing consultation cancellation POST; actor-fenced and never replayed after a 401. */
export async function consultationCancelGuarded(
  bookingId: string,
  requestGuard: () => boolean,
): Promise<ApiResponse<{ bookingId: string }>> {
  if (!requestGuard()) throw new Error("CONSULTATION_CANCEL_SESSION_CHANGED");
  const response = await apiClient<{ bookingId: string }>(
    `/api/v1/consultations/bookings/${encodeURIComponent(bookingId)}/cancel`,
    {
      method: "POST",
      body: {},
      requestGuard,
      skipAuthRefreshReplay: true,
      suppressSubscriptionPaywall: true,
    },
  );
  if (!requestGuard()) throw new Error("CONSULTATION_CANCEL_SESSION_CHANGED");
  return response;
}
