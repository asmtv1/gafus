import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  getAllUsers,
  updateUserAdmin,
  deleteUserAdmin,
} from "./adminUserService";
import { ServiceError, NotFoundError } from "../../errors/ServiceError";

const mockUserFindMany = vi.fn();
const mockUserUpdate = vi.fn();
const mockUserDelete = vi.fn();

const mockHandlePrismaError = vi.fn(() => {
  throw new NotFoundError("Пользователь");
});

vi.mock("../../errors/prismaErrorHandler", () => ({
  handlePrismaError: (...args: unknown[]) => mockHandlePrismaError(...args),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: {
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
      delete: (...args: unknown[]) => mockUserDelete(...args),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  __esModule: true,
  default: {
    hash: vi.fn().mockResolvedValue("hashed"),
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("getAllUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns users on success", async () => {
    mockUserFindMany.mockResolvedValue([
      { id: "u1", username: "user1", role: "USER" },
    ]);

    const result = await getAllUsers();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it("returns error on prisma failure", async () => {
    mockUserFindMany.mockRejectedValue(new Error("DB error"));

    const result = await getAllUsers();

    expect(result.success).toBe(false);
    expect(result.error).toContain("список");
  });
});

describe("updateUserAdmin", () => {
  beforeEach(() => {
    mockUserUpdate.mockReset();
    mockUserUpdate.mockResolvedValue({});
    mockHandlePrismaError.mockReset();
    mockHandlePrismaError.mockImplementation(() => {
      throw new NotFoundError("Пользователь");
    });
  });

  it("returns success on update", async () => {
    const result = await updateUserAdmin("user-1", {
      username: "newuser",
    });

    expect(result.success).toBe(true);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ username: "newuser" }),
      }),
    );
  });

  it("hashes newPassword and passes to update", async () => {
    mockUserUpdate.mockResolvedValue({});

    const result = await updateUserAdmin("user-1", { newPassword: "secret123" });

    expect(result.success).toBe(true);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ password: "hashed" }),
      }),
    );
  });

  it("returns error.message when update throws ServiceError", async () => {
    mockUserUpdate.mockRejectedValue(new ServiceError("Конфликт", "CONFLICT"));

    const result = await updateUserAdmin("user-1", {});

    expect(result).toEqual({ success: false, error: "Конфликт" });
  });

  it("returns ServiceError message from handlePrismaError catch", async () => {
    mockUserUpdate.mockRejectedValue(
      Object.assign(new Error("P2002"), { code: "P2002" }),
    );
    mockHandlePrismaError.mockImplementationOnce(() => {
      throw new NotFoundError("Пользователь");
    });

    const result = await updateUserAdmin("user-1", {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("не найден");
  });

  it("returns fallback error when handlePrismaError returns without throwing", async () => {
    mockUserUpdate.mockRejectedValue(
      Object.assign(new Error("unknown"), { code: "P9999" }),
    );
    mockHandlePrismaError.mockImplementationOnce(() => {
      /* returns without throwing - falls through to fallback */
    });

    const result = await updateUserAdmin("user-1", {});

    expect(result).toEqual({
      success: false,
      error: "Не удалось обновить пользователя",
    });
  });
});


describe("deleteUserAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when deleting self", async () => {
    const result = await deleteUserAdmin("user-1", "user-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("самого себя");
    expect(mockUserDelete).not.toHaveBeenCalled();
  });

  it("returns success when deleting other user", async () => {
    mockUserDelete.mockResolvedValue({});

    const result = await deleteUserAdmin("user-1", "admin-1");

    expect(result.success).toBe(true);
    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  it("returns error.message when delete throws ServiceError", async () => {
    mockUserDelete.mockRejectedValue(new ServiceError("Запрещено", "FORBIDDEN"));

    const result = await deleteUserAdmin("user-1", "admin-1");

    expect(result).toEqual({ success: false, error: "Запрещено" });
  });

  it("returns ServiceError message from handlePrismaError catch during delete", async () => {
    mockUserDelete.mockRejectedValue(
      Object.assign(new Error("P2025"), { code: "P2025" }),
    );
    mockHandlePrismaError.mockImplementationOnce(() => {
      throw new NotFoundError("Пользователь");
    });

    const result = await deleteUserAdmin("user-1", "admin-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("не найден");
  });

  it("returns fallback error when handlePrismaError returns without throwing during delete", async () => {
    mockUserDelete.mockRejectedValue(
      Object.assign(new Error("unknown"), { code: "P9999" }),
    );
    mockHandlePrismaError.mockImplementationOnce(() => {
      /* returns without throwing - falls through to fallback */
    });

    const result = await deleteUserAdmin("user-1", "admin-1");

    expect(result).toEqual({
      success: false,
      error: "Не удалось удалить пользователя",
    });
  });
});

