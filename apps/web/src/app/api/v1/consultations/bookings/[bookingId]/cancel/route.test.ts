import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { cancelBookingByUserMock, getServerSessionMock } = vi.hoisted(
  () => ({
    cancelBookingByUserMock: vi.fn(),
    getServerSessionMock: vi.fn(),
  }),
);

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/core", () => ({
  cancelBookingBodySchema: { parse: (value: unknown) => value },
  cancelBookingByUser: cancelBookingByUserMock,
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/shared/lib/consultation-cache-tags", () => ({
  consultationUserBookingsTag: (id: string) => `user:${id}`,
}));
vi.mock("@/shared/lib/consultation-route-errors", () => ({
  logConsultationRouteError: vi.fn(),
  mapConsultationError: () => null,
  mapZodError: () => null,
}));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: vi.fn() }) }));

import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("https://gafus.test/api/v1/consultations/bookings/booking-1/cancel", {
    body: JSON.stringify(body),
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    method: "POST",
  });
}

const context = { params: Promise.resolve({ bookingId: "booking-1" }) };

describe("POST /api/v1/consultations/bookings/[bookingId]/cancel", () => {
  it("requires auth", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const response = await POST(request({ reason: "changed" }), context);

    expect(response.status).toBe(401);
  });

  it("cancels the current user's booking", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });

    const response = await POST(request({ reason: "changed" }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { bookingId: "booking-1", reason: "changed" },
      success: true,
    });
    expect(cancelBookingByUserMock).toHaveBeenCalledWith("user-1", "booking-1");
  });
});
