import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  adminClearManualGrantMock,
  adminGrantLifetimeMock,
  adminGrantPaidUntilMock,
  cancelYookassaAppSubscriptionMock,
  getServerSessionMock,
  getUserAppSubscriptionAdminSummaryMock,
} = vi.hoisted(() => ({
  adminClearManualGrantMock: vi.fn(),
  adminGrantLifetimeMock: vi.fn(),
  adminGrantPaidUntilMock: vi.fn(),
  cancelYookassaAppSubscriptionMock: vi.fn(),
  getServerSessionMock: vi.fn(),
  getUserAppSubscriptionAdminSummaryMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@gafus/auth", () => ({
  authOptions: {},
}));

vi.mock("@gafus/csrf/server", () => ({
  withCSRFProtection: (handler: unknown) => handler,
}));

vi.mock("@gafus/core/services/appSubscription", () => ({
  adminClearManualGrant: adminClearManualGrantMock,
  adminGrantLifetime: adminGrantLifetimeMock,
  adminGrantPaidUntil: adminGrantPaidUntilMock,
  cancelYookassaAppSubscription: cancelYookassaAppSubscriptionMock,
  getUserAppSubscriptionAdminSummary: getUserAppSubscriptionAdminSummaryMock,
}));

vi.mock("@gafus/logger", () => ({
  createAdminPanelLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { POST } from "./route";

function jsonRequest(body: unknown): NextRequest {
  return new Request("https://admin.gafus.test/api/users/user-1/app-subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("POST /api/users/[id]/app-subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets admins cancel YooKassa renewal for the edited user", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "admin-1", role: "ADMIN" },
    });
    cancelYookassaAppSubscriptionMock.mockResolvedValueOnce({
      hasActiveSubscription: true,
      provider: "YOOKASSA",
      cancelAtPeriodEnd: true,
    });

    const response = await POST(jsonRequest({ action: "cancel_yookassa_renewal" }), {
      params: Promise.resolve({ id: "user-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(cancelYookassaAppSubscriptionMock).toHaveBeenCalledWith("user-1");
    expect(adminClearManualGrantMock).not.toHaveBeenCalled();
    expect(adminGrantLifetimeMock).not.toHaveBeenCalled();
    expect(adminGrantPaidUntilMock).not.toHaveBeenCalled();
  });
});
