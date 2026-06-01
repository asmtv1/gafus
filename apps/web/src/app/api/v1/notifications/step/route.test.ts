import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createStepNotificationMock,
  deleteStepNotificationMock,
  getServerSessionMock,
  requirePremiumOrRewardedAccessForStepNotificationMock,
} = vi.hoisted(
  () => ({
    createStepNotificationMock: vi.fn(),
    deleteStepNotificationMock: vi.fn(),
    getServerSessionMock: vi.fn(),
    requirePremiumOrRewardedAccessForStepNotificationMock: vi.fn(),
  }),
);

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/core/services/rewardedCredits", () => ({
  requirePremiumOrRewardedAccessForStepNotification:
    requirePremiumOrRewardedAccessForStepNotificationMock,
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {
    code = "SUBSCRIPTION_OR_CREDITS_REQUIRED" as const;
  },
}));
vi.mock("@gafus/core/services/notifications", () => ({
  createStepNotification: createStepNotificationMock,
  deleteStepNotification: deleteStepNotificationMock,
}));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: vi.fn() }) }));

import { DELETE, POST } from "./route";

function request(body: unknown, method = "POST") {
  return new NextRequest("https://gafus.test/api/v1/notifications/step", {
    body: JSON.stringify(body),
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    method,
  });
}

describe("/api/v1/notifications/step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires auth before creating notifications", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const response = await POST(request({}));

    expect(response.status).toBe(401);
  });

  it("creates a notification with valid data", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });

    const response = await POST(request({ day: 1, durationSec: 60, stepIndex: 0 }));

    expect(response.status).toBe(200);
    expect(requirePremiumOrRewardedAccessForStepNotificationMock).toHaveBeenCalledWith({
      day: 1,
      maybeUrl: undefined,
      platform: "WEB_DESKTOP",
      stepIndex: 0,
      userId: "user-1",
    });
    expect(createStepNotificationMock).toHaveBeenCalledWith({
      day: 1,
      durationSec: 60,
      maybeUrl: undefined,
      stepIndex: 0,
      stepTitle: undefined,
      userId: "user-1",
    });
  });

  it("maps delete service failures to 400", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });
    deleteStepNotificationMock.mockResolvedValueOnce({ error: "not found", success: false });

    const response = await DELETE(request({ day: 1, deleted: true, stepIndex: 0 }, "DELETE"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "not found", success: false });
  });
});
