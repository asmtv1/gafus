import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { appSubscriptionWebhookMock } = vi.hoisted(() => ({
  appSubscriptionWebhookMock: vi.fn(),
}));

vi.mock("@gafus/core/services/appSubscription", () => ({
  handleYookassaAppSubscriptionWebhook: appSubscriptionWebhookMock,
}));

vi.mock("@gafus/core/services/payments", () => ({
  confirmPaymentFromWebhook: vi.fn(),
  cancelPaymentFromWebhook: vi.fn(),
  refundPaymentFromWebhook: vi.fn(),
  getUserIdByYookassaPaymentId: vi.fn(),
}));

vi.mock("@shared/lib/actions/invalidateCoursesCache", () => ({
  invalidateUserProgressCache: vi.fn(),
}));

vi.mock("@shared/server-actions/cache", () => ({
  invalidateCoursesCache: vi.fn(),
}));

import { POST } from "./route";

function webhookRequest(body: string, headers?: HeadersInit) {
  return new NextRequest("https://gafus.test/api/v1/payments/webhook", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
  });
}

describe("POST /api/v1/payments/webhook", () => {
  afterEach(() => {
    delete process.env.YOOKASSA_SKIP_IP_CHECK;
    vi.clearAllMocks();
  });

  it("rejects requests from non-YooKassa IPs", async () => {
    const response = await POST(
      webhookRequest("{}", {
        "x-forwarded-for": "203.0.113.10",
      }),
    );

    expect(response.status).toBe(403);
  });

  it("returns 400 for malformed JSON after IP validation passes", async () => {
    process.env.YOOKASSA_SKIP_IP_CHECK = "1";

    const response = await POST(webhookRequest("{not-json"));

    expect(response.status).toBe(400);
  });

  it("routes a metadata-less refund to the verified Premium handler", async () => {
    process.env.YOOKASSA_SKIP_IP_CHECK = "1";
    appSubscriptionWebhookMock.mockResolvedValueOnce({ userId: "premium-user" });

    const response = await POST(
      webhookRequest(JSON.stringify({
        type: "notification",
        event: "refund.succeeded",
        object: {
          id: "refund-1",
          payment_id: "payment-1",
          amount: { value: "2490.00" },
        },
      })),
    );

    expect(response.status).toBe(200);
    expect(appSubscriptionWebhookMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "refund.succeeded",
        yookassaRefundId: "refund-1",
        yookassaPaymentId: "payment-1",
        metadata: undefined,
      }),
    );
  });
});
