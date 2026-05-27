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

import { POST } from "./route";

function jsonRequest(body: unknown) {
  return new NextRequest("https://gafus.test/api/v1/training/step/start", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
    },
  });
}

describe("POST /api/v1/training/step/start", () => {
  it("returns 401 when the user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
  });

  it("returns 400 for invalid step payloads before starting progress", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });

    const response = await POST(
      jsonRequest({
        courseId: "",
        dayOnCourseId: "",
        stepIndex: -1,
        status: "INVALID",
        durationSec: -1,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "VALIDATION_ERROR",
    });
  });
});
