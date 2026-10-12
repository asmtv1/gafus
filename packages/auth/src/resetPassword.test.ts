/**
 * Объединённые тесты для resetPasswordByToken и resetPasswordByShortCode.
 * Оба используют prisma.$transaction; общий мок избегает конфликтов между файлами.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";

const mockTransaction = vi.fn();
const mockBcryptHash = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: (cb: (tx: unknown) => Promise<void>) => mockTransaction(cb),
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: (...args: unknown[]) => mockBcryptHash(...args),
  },
}));

describe("resetPasswordByToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBcryptHash.mockResolvedValue("hashed");
  });

  it("success: обновляет пароль, удаляет токен", async () => {
    const mockFindUnique = vi.fn();
    const mockUpdate = vi.fn();
    const mockDelete = vi.fn();
    const mockRefreshUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      const tx = {
        passwordResetToken: { findUnique: mockFindUnique, delete: mockDelete },
        user: { update: mockUpdate },
        refreshToken: { updateMany: mockRefreshUpdateMany },
      };
      await cb(tx);
    });
    mockFindUnique.mockResolvedValue({
      id: "token-id",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 3600000),
    });
    mockUpdate.mockResolvedValue({});
    mockDelete.mockResolvedValue({});

    const { resetPasswordByToken } = await import("./resetPasswordByToken.ts");
    await resetPasswordByToken("valid-token", "newPassword");

    expect(mockBcryptHash).toHaveBeenCalledWith("newPassword", 12);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { token: `sha256:${createHash("sha256").update("valid-token").digest("hex")}` },
    });
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockRefreshUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "token-id" } });
  });

  it("принимает выданную до перехода ссылку и удаляет запись", async () => {
    const legacyToken = "a".repeat(43);
    const mockFindUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "old-token-id",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 3600000),
      });
    const mockDelete = vi.fn();
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      await cb({
        passwordResetToken: { findUnique: mockFindUnique, delete: mockDelete },
        user: { update: vi.fn() },
        refreshToken: { updateMany: vi.fn() },
      });
    });

    const { resetPasswordByToken } = await import("./resetPasswordByToken.ts");
    await resetPasswordByToken(legacyToken, "newPassword");

    expect(mockFindUnique).toHaveBeenNthCalledWith(2, { where: { token: legacyToken } });
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "old-token-id" } });
  });

  it("не принимает хеш из базы как ссылку", async () => {
    const storedHash = `sha256:${"a".repeat(64)}`;
    const mockFindUnique = vi.fn().mockResolvedValue(null);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      await cb({ passwordResetToken: { findUnique: mockFindUnique } });
    });

    const { resetPasswordByToken } = await import("./resetPasswordByToken.ts");
    await expect(resetPasswordByToken(storedHash, "newPassword")).rejects.toThrow(
      "Ссылка устарела или уже использована",
    );
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
  });

  it("throw при несуществующем токене", async () => {
    const mockFindUnique = vi.fn().mockResolvedValue(null);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      await cb({
        passwordResetToken: { findUnique: mockFindUnique, delete: vi.fn() },
        user: { update: vi.fn() },
      });
    });

    const { resetPasswordByToken } = await import("./resetPasswordByToken.ts");
    await expect(resetPasswordByToken("invalid", "newPass")).rejects.toThrow(
      "Ссылка устарела или уже использована",
    );
  });

  it("throw при истёкшем токене", async () => {
    const mockFindUnique = vi.fn().mockResolvedValue({
      token: "expired",
      userId: "user-1",
      expiresAt: new Date(Date.now() - 1000),
    });
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      await cb({
        passwordResetToken: { findUnique: mockFindUnique, delete: vi.fn() },
        user: { update: vi.fn() },
      });
    });

    const { resetPasswordByToken } = await import("./resetPasswordByToken.ts");
    await expect(resetPasswordByToken("expired", "newPass")).rejects.toThrow(
      "Ссылка устарела или уже использована",
    );
  });
});

describe("resetPasswordByShortCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBcryptHash.mockResolvedValue("hashed");
  });

  it("success: обновляет пароль и отзывает сессии при коротком коде", async () => {
    const mockFindUnique = vi.fn();
    const mockUpdate = vi.fn();
    const mockDelete = vi.fn();
    const mockRefreshUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      const tx = {
        passwordResetToken: {
          findUnique: mockFindUnique,
          delete: mockDelete,
        },
        user: { update: mockUpdate },
        refreshToken: { updateMany: mockRefreshUpdateMany },
      };
      await cb(tx);
    });

    mockFindUnique.mockResolvedValue({
      id: "token-id",
      shortCode: "123456",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 3600000),
    });
    mockUpdate.mockResolvedValue({});
    mockDelete.mockResolvedValue({});

    const { resetPasswordByShortCode } = await import("./resetPasswordByShortCode.ts");
    await resetPasswordByShortCode("123456", "newPassword");

    expect(mockBcryptHash).toHaveBeenCalledWith("newPassword", 12);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { shortCode: "123456" },
      include: { user: true },
    });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ password: "hashed", passwordSetAt: expect.any(Date), sessionsRevokedAt: expect.any(Date) }),
    }));
    expect(mockRefreshUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "token-id" } });
  });

  it("throw при недействительном коде", async () => {
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      await cb({
        passwordResetToken: {
          findUnique: vi.fn().mockResolvedValue(null),
          delete: vi.fn(),
        },
        user: { update: vi.fn() },
      });
    });

    const { resetPasswordByShortCode } = await import("./resetPasswordByShortCode.ts");
    await expect(resetPasswordByShortCode("000000", "newPass")).rejects.toThrow(
      "Код недействителен или устарел",
    );
  });
});
