import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteUserAdminMock, getServerSessionMock, revalidatePathMock } = vi.hoisted(() => ({
  deleteUserAdminMock: vi.fn(),
  getServerSessionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@gafus/auth", () => ({
  authOptions: {},
}));

vi.mock("@gafus/core/services/adminUser", () => ({
  deleteUserAdmin: deleteUserAdminMock,
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

import { deleteUser } from "./deleteUser";

function buildFormData(fields: Record<string, string>): FormData {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => formData.set(key, value));
  return formData;
}

describe("deleteUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated users", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    await expect(deleteUser({}, buildFormData({ userId: "user-1" }))).resolves.toEqual({
      success: false,
      error: "Не авторизован",
    });
    expect(deleteUserAdminMock).not.toHaveBeenCalled();
  });

  it("rejects users without admin panel permissions", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "user-1", username: "student", role: "USER" },
    });

    await expect(deleteUser({}, buildFormData({ userId: "user-2" }))).resolves.toEqual({
      success: false,
      error: "Недостаточно прав",
    });
    expect(deleteUserAdminMock).not.toHaveBeenCalled();
  });

  it("requires a user id before deleting", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "admin-1", username: "admin", role: "ADMIN" },
    });

    await expect(deleteUser({}, buildFormData({}))).resolves.toEqual({
      success: false,
      error: "ID пользователя обязателен",
    });
    expect(deleteUserAdminMock).not.toHaveBeenCalled();
  });

  it("deletes a user with the current actor id and revalidates the users page", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "moderator-1", username: "mod", role: "MODERATOR" },
    });
    deleteUserAdminMock.mockResolvedValueOnce({ success: true });

    await expect(deleteUser({}, buildFormData({ userId: "user-1" }))).resolves.toEqual({
      success: true,
    });
    expect(deleteUserAdminMock).toHaveBeenCalledWith("user-1", "moderator-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/main-panel/users");
  });
});
