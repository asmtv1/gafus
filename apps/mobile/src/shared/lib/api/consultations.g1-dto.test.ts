import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsultationBookingDto } from "@gafus/consultation-shared";

const secure = vi.hoisted(() => ({
  getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn(),
}));
vi.mock("expo-secure-store", () => secure);
vi.mock("expo-application", () => ({ nativeApplicationVersion: "1.7.0" }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("@/shared/config", () => ({
  API_BASE_URL: "https://fixture.invalid", NETWORK_TIMEOUTS: { request: 20_000 },
}));
vi.mock("@/shared/lib/tracer", () => ({
  addTracerBreadcrumb: vi.fn(), reportClientError: vi.fn(),
}));
vi.mock("./subscriptionRequired", () => ({
  shouldNotifySubscriptionRequired: vi.fn().mockReturnValue(false),
  notifySubscriptionRequired: vi.fn(),
}));
import { consultationsApi } from "./consultations";

const uuid = "16a7a49f-16a7-4ed3-8c8b-4823c61f4821";
const slot = {
  id: "slot-1", startAtUtc: "2026-10-20T15:00:00.000Z",
  endAtUtc: "2026-10-20T15:30:00.000Z", status: "FREE" as const,
};
const booking: ConsultationBookingDto = {
  id: "booking-1", status: "PENDING_TRAINER_CONFIRMATION", slot,
  cynologistUserId: "trainer-1", cynologistDisplayName: "Кинолог",
  clientUsername: "user-1", clientOwnerName: "Анна",
  clientPhone: "+79990000000", petName: "Бим", petGender: "MALE",
  petAge: "2 года", petBreed: "Корги", clientProblem: "Тянет поводок",
  clientSelfHelpAttempt: "Пробовали лакомства", cancelReason: null,
  confirmationDeadlineAt: "2026-10-20T14:30:00.000Z",
  createdAt: "2026-10-16T10:00:00.000Z",
};
const intake = {
  slotId: "slot-1", idempotencyKey: uuid, clientOwnerName: "Анна",
  clientPhone: "+79990000000", petName: "Бим", petGender: "MALE" as const,
  petAge: "2 года", petBreed: "Корги", clientProblem: "Тянет поводок",
  clientSelfHelpAttempt: "Пробовали лакомства",
};
function response(status: number, json: unknown): Response {
  return {
    status, ok: status >= 200 && status < 300, statusText: "",
    text: vi.fn().mockResolvedValue(JSON.stringify(json)),
    json: vi.fn().mockResolvedValue(json),
  } as unknown as Response;
}

describe("AG3 G1 AG1 consultation DTO handoff — mock HTTP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("__DEV__", false);
    secure.getItemAsync.mockImplementation(async (key: string) =>
      key === "auth_token" ? "native-access" : "native-refresh",
    );
    secure.setItemAsync.mockResolvedValue(undefined);
    secure.deleteItemAsync.mockResolvedValue(undefined);
  });

  it("BOOK: Bearer JSON UUIDv4 and HTTP 201 created", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(201, {
      success: true, data: { kind: "created", booking },
    }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await consultationsApi.book(intake)).toEqual({
      success: true, data: { kind: "created", booking },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://fixture.invalid/api/v1/consultations/book",
      expect.objectContaining({
        method: "POST", body: JSON.stringify(intake),
        headers: expect.objectContaining({
          Authorization: "Bearer native-access", "X-Client-Platform": "android",
        }),
      }),
    );
  });

  it("BOOK: HTTP 200 idempotent replay with identical client key", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(201, { success: true, data: { kind: "created", booking } }))
      .mockResolvedValueOnce(response(200, { success: true, data: { kind: "idempotent_replay", booking } }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await consultationsApi.book(intake)).data?.kind).toBe("created");
    expect((await consultationsApi.book(intake)).data?.kind).toBe("idempotent_replay");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual(
      JSON.parse(fetchMock.mock.calls[0][1].body as string),
    );
  });

  it.each([
    [400, "VALIDATION_ERROR"], [409, "CONSULTATION_SLOT_TAKEN"],
    [403, "CONSULTATION_BOOKING_NOT_INCLUDED"], [402, "SUBSCRIPTION_REQUIRED"],
  ])("BOOK: HTTP %i error code %s survives", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(status, {
      success: false, error: "Отказ", code,
    })));
    await expect(consultationsApi.book(intake)).resolves.toMatchObject({
      success: false, error: "Отказ", code,
    });
    expect(secure.deleteItemAsync).not.toHaveBeenCalled();
  });

  it("LIST: preserves bookingEligibility/dayOffDates and native slot query", async () => {
    const card = {
      id: "cynologist-1", userId: "trainer-1", username: "trainer",
      displayName: "Кинолог", avatarUrl: null, about: null, slotDurationMin: 30,
    };
    const eligibility = { canBook: true, reason: null, nextBookingAt: null, message: null };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, {
        success: true, data: [card], bookingEligibility: eligibility,
      }))
      .mockResolvedValueOnce(response(200, {
        success: true, data: [slot], dayOffDates: ["2026-10-21"],
        bookingEligibility: eligibility,
      }))
      .mockResolvedValueOnce(response(200, { success: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await consultationsApi.listCynologists()).toMatchObject({
      success: true, data: [card], bookingEligibility: eligibility,
    });
    expect(await consultationsApi.getSlotsCalendar(
      "trainer-1", "2026-10-20T00:00:00.000Z", "2026-10-25T00:00:00.000Z",
    )).toMatchObject({
      success: true, data: [slot], bookingEligibility: eligibility,
      dayOffDates: ["2026-10-21"],
    });
    expect(await consultationsApi.verifySlotFree("trainer-1", "slot-1")).toEqual({ success: true });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://fixture.invalid/api/v1/consultations/cynologists/trainer-1/slots?from=2026-10-20T00%3A00%3A00.000Z&to=2026-10-25T00%3A00%3A00.000Z&includeBusy=1",
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      "https://fixture.invalid/api/v1/consultations/cynologists/trainer-1/slots/slot-1/verify",
    );
  });

  it("MY: maps owner list cursor and cancellation empty JSON", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, {
        success: true, data: { items: [booking], nextCursor: "next:page" },
      }))
      .mockResolvedValueOnce(response(200, {
        success: true, data: { bookingId: "booking-1" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await consultationsApi.myBookings("cursor:page")).toEqual({
      success: true, data: { items: [booking], nextCursor: "next:page" },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://fixture.invalid/api/v1/consultations/my?cursor=cursor%3Apage",
    );
    expect(await consultationsApi.cancelBooking("booking-1")).toEqual({
      success: true, data: { bookingId: "booking-1" },
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://fixture.invalid/api/v1/consultations/bookings/booking-1/cancel",
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", body: "{}" });
  });

  it("TRAINER: reads owner bookings and posts a guarded confirm exactly once", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, { success: true, data: [booking] }))
      .mockResolvedValueOnce(response(200, {
        success: true, data: { bookingId: "booking-1" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await consultationsApi.trainerBookings()).toEqual({
      success: true, data: [booking],
    });
    expect(await consultationsApi.trainerTransition("booking-1", "confirm", () => true))
      .toEqual({ success: true, data: { bookingId: "booking-1" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0])
      .toBe("https://fixture.invalid/api/v1/consultations/trainer/bookings");
    expect(fetchMock.mock.calls[1][0])
      .toBe("https://fixture.invalid/api/v1/consultations/trainer/bookings/booking-1/confirm");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST", body: "{}",
      headers: expect.objectContaining({ Authorization: "Bearer native-access" }),
    });
  });

  it("TRAINER: retired actor never sends a transition and 401 cannot replay", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(401, {
      success: false, error: "unauthorized",
    }));
    vi.stubGlobal("fetch", fetchMock);
    const denied = await consultationsApi.trainerTransition("booking-1", "confirm", () => false);
    expect(denied.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    const invalid = await consultationsApi.trainerTransition("../escape", "confirm", () => true);
    expect(invalid.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    const result = await consultationsApi.trainerTransition("booking-1", "reject", () => true);
    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0])
      .toBe("https://fixture.invalid/api/v1/consultations/trainer/bookings/booking-1/reject");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST", body: '{"reason":""}',
    });
  });

  it("AUTH: 401 refreshes JSON native token and retries Bearer exactly once", async () => {
    let token = "native-access";
    secure.getItemAsync.mockImplementation(async (key: string) =>
      key === "auth_token" ? token : "native-refresh",
    );
    secure.setItemAsync.mockImplementation(async (key: string, value: string) => {
      if (key === "auth_token") token = value;
    });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/v1/auth/refresh")) {
        expect(init).toMatchObject({
          method: "POST", body: JSON.stringify({ refreshToken: "native-refresh" }),
        });
        expect(init?.headers).not.toHaveProperty("X-Gafus-Auth-Transport", "cookie");
        return response(200, {
          success: true, data: { accessToken: "new-access", refreshToken: "new-refresh" },
        });
      }
      return (init?.headers as Record<string, string>)?.Authorization === "Bearer native-access"
        ? response(401, { success: false, code: "UNAUTHORIZED" })
        : response(200, { success: true, data: { items: [], nextCursor: null } });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await consultationsApi.myBookings()).toEqual({
      success: true, data: { items: [], nextCursor: null },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/auth/refresh"))).toHaveLength(1);
    expect(secure.deleteItemAsync).not.toHaveBeenCalled();
  });

  it.each([403, 429, 503])("AUTH: non-401 HTTP %i does not remove credentials", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(status, {
      success: false, error: "Временный отказ", code: "REJECTED",
    })));
    const result = await consultationsApi.myBookings();
    expect(result.success).toBe(false);
    expect(secure.deleteItemAsync).not.toHaveBeenCalled();
  });
});
