import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { getServerSessionMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@gafus/auth", () => ({
  authOptions: {},
}));

vi.mock("@gafus/core/services/payments", () => ({
  createArticlePayment: vi.fn(),
  createPayment: vi.fn(),
}));

import { POST } from "./route";

function jsonRequest(body: unknown) {
  return new NextRequest("https://gafus.test/api/v1/payments/create", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
    },
  });
}

describe("POST /api/v1/payments/create", () => {
  it("returns 401 when the user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const response = await POST(jsonRequest({ courseId: "course-1" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
  });

  it("returns 400 when both courseId and articleId are provided", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });

    const response = await POST(
      jsonRequest({
        courseId: "course-1",
        articleId: "article-1",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "VALIDATION_ERROR",
    });
  });

  it("returns 410 for authenticated legacy purchases", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });

    const response = await POST(jsonRequest({ courseId: "course-1" }));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "LEGACY_PURCHASES_DISABLED",
    });
  });
});
