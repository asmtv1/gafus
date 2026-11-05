/** Existing owner-bound Hono consultation mutations. No server keys or tokens persist in browser storage. */
import { ApiError, apiRequest } from "../../shared/api/client";
import type { Booking } from "./consultationReadApi";

const part = /^[A-Za-z0-9_-]{1,128}$/;
function safePart(value: string): string {
  if (!part.test(value)) throw Error("INVALID_CONSULTATION_ID");
  return encodeURIComponent(value);
}
const base = "/api/v1/consultations";
export type BookingIntake = {
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
};
export function verifyBookingSlot(trainerId: string, slotId: string) {
  return apiRequest<unknown>(
    `${base}/cynologists/${safePart(trainerId)}/slots/${safePart(slotId)}/verify`,
    { browserAuth: true },
  );
}
export function createConsultationBooking(body: BookingIntake) {
  if (!part.test(body.slotId) || !/^[0-9a-f-]{36}$/i.test(body.idempotencyKey))
    throw Error("INVALID_CONSULTATION_BOOKING_REQUEST");
  return apiRequest<{ kind: "created" | "idempotent_replay"; booking: { id: string } }>(
    `${base}/book`,
    { method: "POST", browserAuth: true, json: body },
  );
}
export function recoverConsultationBooking(key: string) {
  if (!/^[0-9a-f-]{36}$/i.test(key)) throw Error("INVALID_CONSULTATION_KEY");
  return apiRequest<{ state: "FOUND" | "UNKNOWN"; booking?: { id: string } }>(
    `${base}/book/lookup`,
    { method: "POST", browserAuth: true, json: { idempotencyKey: key } },
  );
}
export function cancelConsultationBooking(bookingId: string) {
  return apiRequest<{ bookingId: string }>(`${base}/bookings/${safePart(bookingId)}/cancel`, {
    method: "POST",
    browserAuth: true,
    json: {},
  });
}
export type VoxResult<T> = { success: true; data: T } | { success: false; error: string };
export type VoxSignResult = { success: true; token: string } | { success: false; error: string };
export function consultationError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Сессия завершена. Войдите снова.";
    if (error.status === 402) return "Для записи требуется подходящая подписка.";
    if (error.status === 403) return "Запись сейчас недоступна для вашего аккаунта.";
    if (error.status === 404) return "Запись или выбранный слот не найдены.";
    if (error.status === 409) return "Время уже занято. Выберите другой слот.";
    if (error.status === 429) return "Слишком много запросов. Повторите позже.";
  }
  return "Не удалось выполнить действие. Проверьте соединение.";
}
function callPath(id: string, suffix: "prepare" | "admission" | "sign") {
  return `${base}/bookings/${safePart(id)}/voximplant/${suffix}`;
}
export async function prepareConsultationCall(
  id: string,
): Promise<VoxResult<{ username: string; room: string }>> {
  try {
    const d = await apiRequest<{ username: string; room: string }>(callPath(id, "prepare"), {
      method: "POST",
      browserAuth: true,
      json: {},
    });
    if (typeof d?.username !== "string" || !d.username || typeof d.room !== "string" || !d.room)
      throw Error("INVALID_CALL_PREPARE");
    return { success: true, data: d };
  } catch (e) {
    return { success: false, error: consultationError(e) };
  }
}
export async function admitConsultationCall(
  id: string,
): Promise<VoxResult<{ admission: string; expires: number }>> {
  try {
    const d = await apiRequest<{ admission: string; expires: number }>(callPath(id, "admission"), {
      method: "POST",
      browserAuth: true,
      json: {},
    });
    if (typeof d?.admission !== "string" || !d.admission || typeof d.expires !== "number")
      throw Error("INVALID_CALL_ADMISSION");
    return { success: true, data: d };
  } catch (e) {
    return { success: false, error: consultationError(e) };
  }
}
export async function signConsultationCall(id: string, key: string): Promise<VoxSignResult> {
  try {
    if (typeof key !== "string" || key.length < 8 || key.length > 512)
      throw Error("INVALID_CALL_KEY");
    // The sign endpoint's established envelope places token at the top level.
    const response = await fetch(callPath(id, "sign"), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Gafus-Auth-Transport": "cookie",
      },
      body: JSON.stringify({ key }),
    });
    const d: unknown = await response.json();
    if (
      !response.ok ||
      !d ||
      typeof d !== "object" ||
      !("success" in d) ||
      d.success !== true ||
      !("token" in d) ||
      typeof d.token !== "string" ||
      !d.token
    )
      throw new ApiError(response.status, "CALL_SIGN_FAILED");
    return { success: true, token: d.token };
  } catch (e) {
    return { success: false, error: consultationError(e) };
  }
}
export function canCancelBooking(status: Booking["status"]) {
  return status === "PENDING_TRAINER_CONFIRMATION" || status === "CONFIRMED";
}
