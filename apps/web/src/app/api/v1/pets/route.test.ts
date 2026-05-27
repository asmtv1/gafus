import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { createPetMock, getServerSessionMock, getUserPetsMock } = vi.hoisted(() => ({
  createPetMock: vi.fn(),
  getServerSessionMock: vi.fn(),
  getUserPetsMock: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@shared/lib/pets", () => ({
  createPet: createPetMock,
  getUserPets: getUserPetsMock,
}));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: vi.fn() }) }));

import { GET, POST } from "./route";

function request(body: unknown) {
  return new NextRequest("https://gafus.test/api/v1/pets", {
    body: JSON.stringify(body),
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    method: "POST",
  });
}

describe("/api/v1/pets", () => {
  it("requires auth before listing pets", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("lists pets for an authenticated user", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });
    getUserPetsMock.mockResolvedValueOnce([{ id: "pet-1" }]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [{ id: "pet-1" }], success: true });
  });

  it("validates pet creation payloads", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });

    const response = await POST(request({ name: "Бим" }));

    expect(response.status).toBe(400);
    expect(createPetMock).not.toHaveBeenCalled();
  });
});
