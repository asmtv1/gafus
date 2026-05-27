import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServerSessionMock, revalidatePathMock, updateUserAdminMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  updateUserAdminMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@gafus/auth", () => ({
  authOptions: {},
}));

vi.mock("@gafus/core/services/adminUser", () => ({
  updateUserAdmin: updateUserAdminMock,
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
    });
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
});
