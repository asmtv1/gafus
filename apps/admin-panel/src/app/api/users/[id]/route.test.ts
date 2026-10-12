import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { getServerSessionMock, updateUserAdminMock, partnerChangeRequiresAdminMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  updateUserAdminMock: vi.fn(),
  partnerChangeRequiresAdminMock: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/core/services/adminUser", () => ({
  updateUserAdmin: updateUserAdminMock,
  partnerChangeRequiresAdmin: partnerChangeRequiresAdminMock,
}));
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
    partnerChangeRequiresAdminMock.mockResolvedValue(true);

    const response = await PUT(jsonRequest({ role: "PARTNER", partnerPromoCodeId: "promo-1" }), {
      params: Promise.resolve({ id: "user-1" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Только администратор может управлять ролью и промокодом партнёра",
    });
    expect(updateUserAdminMock).not.toHaveBeenCalled();
    expect(partnerChangeRequiresAdminMock).toHaveBeenCalledWith("moderator-1", "user-1", { role: "PARTNER", partnerPromoCodeId: "promo-1" });
  });

  it("allows a current database admin to bind the submitted promo code", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    partnerChangeRequiresAdminMock.mockResolvedValue(false);
    updateUserAdminMock.mockResolvedValue({ success: true });

    const response = await PUT(jsonRequest({ role: "PARTNER", partnerPromoCodeId: "promo-1" }), {
      params: Promise.resolve({ id: "user-1" }),
    });

    expect(response.status).toBe(200);
    expect(updateUserAdminMock).toHaveBeenCalledWith("user-1", { role: "PARTNER", partnerPromoCodeId: "promo-1" }, "admin-1");
    expect(partnerChangeRequiresAdminMock).toHaveBeenCalledWith("admin-1", "user-1", { role: "PARTNER", partnerPromoCodeId: "promo-1" });
  });
});
