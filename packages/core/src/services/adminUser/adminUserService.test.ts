import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  getAllUsers,
  updateUserAdmin,
  deleteUserAdmin,
  partnerChangeRequiresAdmin,
} from "./adminUserService";
import { ServiceError, NotFoundError } from "../../errors/ServiceError";

const mockUserFindMany = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockUserDelete = vi.fn();
const mockTransaction = vi.fn();
const mockBindPartnerPromoCodeInTransaction = vi.fn();

const mockHandlePrismaError = vi.fn(() => {
  throw new NotFoundError("Пользователь");
});

vi.mock("../../errors/prismaErrorHandler", () => ({
  handlePrismaError: (...args: unknown[]) => mockHandlePrismaError(...args),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    user: {
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
      delete: (...args: unknown[]) => mockUserDelete(...args),
    },
  },
}));

vi.mock("../appSubscription/partnerService", () => ({
  bindPartnerPromoCodeInTransaction: (...args: unknown[]) => mockBindPartnerPromoCodeInTransaction(...args),
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

describe("partnerChangeRequiresAdmin", () => {
  let actorRole = "MODERATOR";
  let targetRole = "USER";

  beforeEach(() => {
    mockUserFindUnique.mockReset();
    actorRole = "MODERATOR";
    targetRole = "USER";
    mockUserFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ role: where.id === "actor" ? actorRole : targetRole }));
  });

  it("does not query the database for a non-role update", async () => {
    expect(await partnerChangeRequiresAdmin("actor", "target", {})).toBe(false);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("requires a database admin to promote a partner", async () => {
    expect(await partnerChangeRequiresAdmin("actor", "target", { role: "PARTNER" })).toBe(true);
    actorRole = "ADMIN";
    expect(await partnerChangeRequiresAdmin("actor", "target", { role: "PARTNER" })).toBe(false);
  });

  it("requires an admin to demote an existing partner", async () => {
    targetRole = "PARTNER";
    expect(await partnerChangeRequiresAdmin("actor", "target", { role: "USER" })).toBe(true);
  });

  it("requires an admin to set a partner promo, but not a nonpartner role", async () => {
    expect(await partnerChangeRequiresAdmin("actor", "target", { partnerPromoCodeId: "promo-1" })).toBe(true);
    expect(await partnerChangeRequiresAdmin("actor", "target", { role: "TRAINER" })).toBe(false);
  });
});

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
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          savedRegistrationPromoCode: { select: { code: true } },
        }),
      }),
    );
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
    mockUserFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        $queryRaw: vi.fn().mockResolvedValue([{ id: "actor-1" }]),
        user: { update: mockUserUpdate, findUnique: mockUserFindUnique },
      }),
    );
    mockBindPartnerPromoCodeInTransaction.mockReset();
    mockHandlePrismaError.mockReset();
    mockHandlePrismaError.mockImplementation(() => {
      throw new NotFoundError("Пользователь");
    });
  });

  it("rechecks partner permissions under transaction locks", async () => {
    mockUserFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ role: where.id === "moderator" ? "MODERATOR" : "USER" }));
    const result = await updateUserAdmin(
      "user-1", { role: "PARTNER", partnerPromoCodeId: "promo-1" }, "moderator",
    );
    expect(result).toEqual({
      success: false,
      error: "Только администратор может управлять ролью и промокодом партнёра",
    });
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockBindPartnerPromoCodeInTransaction).not.toHaveBeenCalled();
  });

  it("rejects partner role writes without a trusted actor ID", async () => {
    const result = await updateUserAdmin("user-1", {
      role: "PARTNER", partnerPromoCodeId: "promo-1",
    });
    expect(result.success).toBe(false);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("rechecks partner demotion against current role inside the transaction", async () => {
    mockUserFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ role: where.id === "moderator" ? "MODERATOR" : "PARTNER" }));
    const result = await updateUserAdmin("user-1", { role: "USER" }, "moderator");
    expect(result.success).toBe(false);
    expect(mockUserUpdate).not.toHaveBeenCalled();
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

  it("runs partner binding inside the same update transaction", async () => {
    mockBindPartnerPromoCodeInTransaction.mockResolvedValue({});

    const result = await updateUserAdmin("partner-1", { role: "PARTNER", partnerPromoCodeId: "promo-1" }, "actor-1");

    expect(result).toEqual({ success: true });
    expect(mockBindPartnerPromoCodeInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ update: mockUserUpdate }) }),
      { userId: "partner-1", promoCodeId: "promo-1" },
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
    mockTransaction.mockImplementation(async (fn) => fn({ user: { delete: mockUserDelete }, $executeRaw: vi.fn().mockResolvedValue(1) }));
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
