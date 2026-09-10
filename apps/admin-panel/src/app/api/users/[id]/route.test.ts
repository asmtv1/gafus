import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { getServerSessionMock, updateUserAdminMock, userFindUniqueMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  updateUserAdminMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/core/services/adminUser", () => ({ updateUserAdmin: updateUserAdminMock }));
vi.mock("@gafus/prisma", () => ({ prisma: { user: { findUnique: userFindUniqueMock } } }));
vi.mock("@gafus/logger", () => ({
  createAdminPanelLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { PUT } from "./route";

function jsonRequest(body: unknown): NextRequest {
  return new Request("https://admin.gafus.test/api/users/user-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("PUT /api/users/[id] partner controls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the current database role and rejects a moderator assigning a partner", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "moderator-1", role: "MODERATOR" } });
    userFindUniqueMock.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ role: where.id === "moderator-1" ? "MODERATOR" : "USER" }),
    );

    const response = await PUT(jsonRequest({ role: "PARTNER", partnerPromoCodeId: "promo-1" }), {
      params: Promise.resolve({ id: "user-1" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Только администратор может управлять ролью и промокодом партнёра",
    });
    expect(updateUserAdminMock).not.toHaveBeenCalled();
  });

  it("allows a current database admin to bind the submitted promo code", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    userFindUniqueMock.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ role: where.id === "admin-1" ? "ADMIN" : "USER" }),
    );
    updateUserAdminMock.mockResolvedValue({ success: true });

    const response = await PUT(jsonRequest({ role: "PARTNER", partnerPromoCodeId: "promo-1" }), {
      params: Promise.resolve({ id: "user-1" }),
    });

    expect(response.status).toBe(200);
    expect(updateUserAdminMock).toHaveBeenCalledWith("user-1", { role: "PARTNER", partnerPromoCodeId: "promo-1" });
  });
});
