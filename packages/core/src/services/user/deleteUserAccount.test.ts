import { Prisma as PrismaRuntime } from "@prisma/client";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { deleteUserAccount } from "./deleteUserAccount";

const mockValidateCredentials = vi.fn();

vi.mock("../auth/authService", () => ({
  validateCredentials: (...args: unknown[]) => mockValidateCredentials(...args),
}));

const mockUserFindUnique = vi.fn();
const mockCourseCount = vi.fn();
const mockTrainingDayCount = vi.fn();
const mockStepCount = vi.fn();
const mockStepTemplateCount = vi.fn();
const mockArticleCount = vi.fn();
const mockRefreshUpdateMany = vi.fn();
const mockConsentLogUpdateMany = vi.fn();
const mockUserDelete = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    course: { count: (...args: unknown[]) => mockCourseCount(...args) },
    trainingDay: { count: (...args: unknown[]) => mockTrainingDayCount(...args) },
    step: { count: (...args: unknown[]) => mockStepCount(...args) },
    stepTemplate: { count: (...args: unknown[]) => mockStepTemplateCount(...args) },
    article: { count: (...args: unknown[]) => mockArticleCount(...args) },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(message: string, opts: { code: string }) {
        super(message);
        this.name = "PrismaClientKnownRequestError";
        this.code = opts.code;
      }
    },
    DbNull: PrismaRuntime.DbNull,
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

describe("deleteUserAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        refreshToken: { updateMany: mockRefreshUpdateMany },
        consentLog: { updateMany: mockConsentLogUpdateMany },
        user: { delete: mockUserDelete },
      };
      return fn(tx);
    });
    mockCourseCount.mockResolvedValue(0);
    mockTrainingDayCount.mockResolvedValue(0);
    mockStepCount.mockResolvedValue(0);
    mockStepTemplateCount.mockResolvedValue(0);
    mockArticleCount.mockResolvedValue(0);
    mockRefreshUpdateMany.mockResolvedValue({ count: 1 });
    mockConsentLogUpdateMany.mockResolvedValue({ count: 0 });
    mockUserDelete.mockResolvedValue({});
    mockValidateCredentials.mockResolvedValue({
      success: true,
      user: {
        id: "u1",
        username: "tester",
        role: "USER",
        password: "hash",
      },
    });
  });

  it("returns success and revokes tokens before user.delete", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "tester",
      role: "USER",
      passwordSetAt: new Date(),
      email: "t@example.com",
    });

    const result = await deleteUserAccount({ actorUserId: "u1", password: "secret" });

    expect(result).toEqual({ success: true });
    expect(mockValidateCredentials).toHaveBeenCalledWith("tester", "secret");
    expect(mockRefreshUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mockConsentLogUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: {
        formData: PrismaRuntime.DbNull,
        ipAddress: null,
        userAgent: null,
      },
    });
    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(mockRefreshUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockConsentLogUpdateMany.mock.invocationCallOrder[0]!,
    );
    expect(mockConsentLogUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockUserDelete.mock.invocationCallOrder[0]!,
    );
  });

  it("allows PREMIUM role", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "prem",
      role: "PREMIUM",
      passwordSetAt: new Date(),
      email: null,
    });

    const result = await deleteUserAccount({ actorUserId: "u1", password: "secret" });

    expect(result).toEqual({ success: true });
  });

  it("rejects wrong password", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "tester",
      role: "USER",
      passwordSetAt: new Date(),
      email: null,
    });
    mockValidateCredentials.mockResolvedValue({ success: false });

    const result = await deleteUserAccount({ actorUserId: "u1", password: "wrong" });

    expect(result).toEqual({ success: false, error: "Неверный пароль" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects TRAINER role", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "trainer",
      role: "TRAINER",
      passwordSetAt: new Date(),
      email: null,
    });

    const result = await deleteUserAccount({ actorUserId: "u1", password: "secret" });

    expect(result.success).toBe(false);
    expect(result).toMatchObject({ code: "FORBIDDEN" });
    expect(mockValidateCredentials).not.toHaveBeenCalled();
  });

  it("rejects when passwordSetAt is null", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "tester",
      role: "USER",
      passwordSetAt: null,
      email: null,
    });

    const result = await deleteUserAccount({ actorUserId: "u1", password: "secret" });

    expect(result).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
    expect(mockValidateCredentials).not.toHaveBeenCalled();
  });

  it("blocks when user authored a course", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "tester",
      role: "USER",
      passwordSetAt: new Date(),
      email: null,
    });
    mockCourseCount.mockResolvedValue(1);

    const result = await deleteUserAccount({ actorUserId: "u1", password: "secret" });

    expect(result).toMatchObject({ success: false, code: "CONFLICT" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects empty actorUserId", async () => {
    const result = await deleteUserAccount({ actorUserId: "   ", password: "secret" });

    expect(result).toMatchObject({ code: "VALIDATION" });
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });
});
