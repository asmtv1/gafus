import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServerSessionMock, revalidatePathMock, updateUserAdminMock, partnerChangeRequiresAdminMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  updateUserAdminMock: vi.fn(),
  partnerChangeRequiresAdminMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@gafus/auth", () => ({
  authOptions: {},
}));

vi.mock("@gafus/core/services/adminUser", () => ({
  updateUserAdmin: updateUserAdminMock,
  partnerChangeRequiresAdmin: partnerChangeRequiresAdminMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@gafus/logger", () => ({
  createAdminPanelLogger: () => ({
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

import { updateUser } from "./updateUser";

function buildFormData(fields: Record<string, string>): FormData {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => formData.set(key, value));
  return formData;
}

describe("updateUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    partnerChangeRequiresAdminMock.mockImplementation(async (actorId: string, _userId: string, input: { role?: string; partnerPromoCodeId?: string }) =>
      actorId === "moderator-1" && (input.partnerPromoCodeId !== undefined || input.role === "PARTNER"));
  });

  it("rejects unauthenticated users before calling the service", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    await expect(updateUser({}, buildFormData({ id: "user-1" }))).resolves.toEqual({
      success: false,
      error: "Не авторизован",
    });
    expect(updateUserAdminMock).not.toHaveBeenCalled();
  });

  it("rejects users without admin panel permissions", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "user-1", username: "student", role: "USER" },
    });

    await expect(updateUser({}, buildFormData({ id: "user-1" }))).resolves.toEqual({
      success: false,
      error: "Недостаточно прав",
    });
    expect(updateUserAdminMock).not.toHaveBeenCalled();
  });

  it("validates required id and password length before mutation", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "admin-1", username: "admin", role: "ADMIN" },
    });

    const result = await updateUser(
      {},
      buildFormData({ id: "", role: "USER", newPassword: "123" }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("ID обязателен");
    expect(result.error).toContain("Пароль минимум 6 символов");
    expect(updateUserAdminMock).not.toHaveBeenCalled();
  });

  it("updates a user and revalidates the users page", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "moderator-1", username: "mod", role: "MODERATOR" },
    });
    updateUserAdminMock.mockResolvedValueOnce({ success: true });

    await expect(
      updateUser(
        {},
        buildFormData({
          id: "user-1",
          username: "updated",
          phone: "+79999999999",
          role: "TRAINER",
          newPassword: "secret1",
        }),
      ),
    ).resolves.toEqual({ success: true });

    expect(updateUserAdminMock).toHaveBeenCalledWith("user-1", {
      username: "updated",
      phone: "+79999999999",
      role: "TRAINER",
      newPassword: "secret1",
    }, "moderator-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/main-panel/users");
  });

  it("returns service errors without revalidating", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "admin-1", username: "admin", role: "ADMIN" },
    });
    updateUserAdminMock.mockResolvedValueOnce({ success: false, error: "Нельзя изменить роль" });

    await expect(
      updateUser(
        {},
        buildFormData({
          id: "user-1",
          username: "updated",
          phone: "+79999999999",
          role: "TRAINER",
          newPassword: "secret1",
        }),
      ),
    ).resolves.toEqual({
      success: false,
      error: "Нельзя изменить роль",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not let a current moderator assign a partner even if the form includes a promo code", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "moderator-1", username: "mod", role: "MODERATOR" },
    });

    await expect(updateUser({}, buildFormData({
      id: "user-1", username: "updated", phone: "+79999999999", role: "PARTNER", newPassword: "secret1", partnerPromoCodeId: "promo-1",
    }))).resolves.toEqual({
      success: false,
      error: "Только администратор может управлять ролью и промокодом партнёра",
    });
    expect(updateUserAdminMock).not.toHaveBeenCalled();
  });

  it("carries a partner promo code through for a current database admin", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "admin-1", username: "admin", role: "ADMIN" },
    });
    updateUserAdminMock.mockResolvedValueOnce({ success: true });

    await expect(updateUser({}, buildFormData({
      id: "user-1", username: "updated", phone: "+79999999999", role: "PARTNER", newPassword: "secret1", partnerPromoCodeId: "promo-1",
    }))).resolves.toEqual({ success: true });
    expect(updateUserAdminMock).toHaveBeenCalledWith("user-1", expect.objectContaining({ role: "PARTNER", partnerPromoCodeId: "promo-1" }), "admin-1");
  });
});
