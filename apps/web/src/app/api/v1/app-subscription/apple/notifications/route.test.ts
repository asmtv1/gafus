import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { handleNotificationMock } = vi.hoisted(() => ({
  handleNotificationMock: vi.fn(),
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: vi.fn(),
  }),
}));

vi.mock("@gafus/core/services/appSubscription", () => ({
  handleAppleAppSubscriptionNotification: handleNotificationMock,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("https://gafus.test/api/v1/app-subscription/apple/notifications", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/v1/app-subscription/apple/notifications", () => {
  it("ignores notifications without signedPayload", async () => {
    const response = await POST(request({}));

    expect(response.status).toBe(200);
    expect(handleNotificationMock).not.toHaveBeenCalled();
  });

  it("passes signedPayload to the app subscription service", async () => {
    const response = await POST(request({ signedPayload: "signed-payload" }));

    expect(response.status).toBe(200);
    expect(handleNotificationMock).toHaveBeenCalledWith({ signedPayload: "signed-payload" });
  });
});
