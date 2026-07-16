import { createHmac } from "crypto";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    vi.unstubAllEnvs();
  });

  it("rejects requests from non-YooKassa IPs", async () => {
    vi.stubEnv("YOOKASSA_SKIP_IP_CHECK", "0");

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

  it.each([
    ["iOS", "YOOKASSA_MOBILE_API_SECRET_KEY_IOS", "ios-secret"],
    ["Android", "YOOKASSA_MOBILE_API_SECRET_KEY_ANDROID", "android-secret"],
  ])("accepts a webhook signed with the %s shop secret", async (_platform, envName, secret) => {
    vi.stubEnv(envName, secret);
    const body = JSON.stringify({ type: "ignored" });
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    const response = await POST(
      webhookRequest(body, {
        "x-forwarded-for": "185.71.76.1",
        "x-yookassa-signature": signature,
      }),
    );

    expect(response.status).toBe(200);
  });
});
