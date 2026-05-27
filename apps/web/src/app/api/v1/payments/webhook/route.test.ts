import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

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
});
