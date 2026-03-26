import { describe, expect, it, beforeEach, vi } from "vitest";

const { mockDbNull } = vi.hoisted(() => ({ mockDbNull: Symbol("DbNull") }));

import { deleteUserAccount, requestAccountDeletionCode } from "./deleteUserAccount";

const mockAccountDeletionFindFirst = vi.fn();
const mockAccountDeletionDeleteMany = vi.fn();
const mockTokDeleteMany = vi.fn();
const mockTokFindUnique = vi.fn();
const mockTokCreate = vi.fn();
const mockUserUpdate = vi.fn();
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
const mockSendDeletionEmail = vi.fn();

vi.mock("../auth/transactionalAuthMail", () => ({
  sendAccountDeletionCodeEmail: (...args: unknown[]) => mockSendDeletionEmail(...args),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    accountDeletionToken: {
      findFirst: (...args: unknown[]) => mockAccountDeletionFindFirst(...args),
    },
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
    DbNull: mockDbNull,
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
        accountDeletionToken: { deleteMany: mockAccountDeletionDeleteMany },
        refreshToken: { updateMany: mockRefreshUpdateMany },
        consentLog: { updateMany: mockConsentLogUpdateMany },
        user: { delete: mockUserDelete, update: mockUserUpdate },
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
    mockAccountDeletionDeleteMany.mockResolvedValue({ count: 1 });
    mockAccountDeletionFindFirst.mockResolvedValue({
      id: "tok1",
      userId: "u1",
      shortCode: "123456",
      expiresAt: new Date(Date.now() + 60_000),
    });
    mockUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "tester",
      role: "USER",
      email: "t@example.com",
    });
  });

  it("returns success and deletes tokens before user.delete", async () => {
    const result = await deleteUserAccount({ actorUserId: "u1", code: "123456" });

    expect(result).toEqual({ success: true });
    expect(mockAccountDeletionFindFirst).toHaveBeenCalledWith({
      where: { userId: "u1", shortCode: "123456" },
    });
    expect(mockAccountDeletionDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(mockRefreshUpdateMany).toHaveBeenCalled();
    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });

  it("allows PREMIUM with valid code", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "prem",
      role: "PREMIUM",
      email: "p@example.com",
    });

    const result = await deleteUserAccount({ actorUserId: "u1", code: "123456" });

    expect(result).toEqual({ success: true });
  });

  it("rejects missing or wrong code", async () => {
    mockAccountDeletionFindFirst.mockResolvedValue(null);

    const result = await deleteUserAccount({ actorUserId: "u1", code: "999999" });

    expect(result.success).toBe(false);
    expect(result).toMatchObject({
      error: expect.stringContaining("Неверный или просроченный код") as string,
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects TRAINER role", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "trainer",
      role: "TRAINER",
      email: "t@example.com",
    });

    const result = await deleteUserAccount({ actorUserId: "u1", code: "123456" });

    expect(result.success).toBe(false);
    expect(result).toMatchObject({ code: "FORBIDDEN" });
    expect(mockAccountDeletionFindFirst).not.toHaveBeenCalled();
  });

  it("blocks when user authored a course", async () => {
    mockCourseCount.mockResolvedValue(1);

    const result = await deleteUserAccount({ actorUserId: "u1", code: "123456" });

    expect(result).toMatchObject({ success: false, code: "CONFLICT" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects empty actorUserId", async () => {
    const result = await deleteUserAccount({ actorUserId: "   ", code: "123456" });

    expect(result).toMatchObject({ code: "VALIDATION" });
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });
});

describe("requestAccountDeletionCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendDeletionEmail.mockResolvedValue(undefined);
    mockCourseCount.mockResolvedValue(0);
    mockTrainingDayCount.mockResolvedValue(0);
    mockStepCount.mockResolvedValue(0);
    mockStepTemplateCount.mockResolvedValue(0);
    mockArticleCount.mockResolvedValue(0);
    mockTokDeleteMany.mockResolvedValue({ count: 0 });
    mockTokFindUnique.mockResolvedValue(null);
    mockTokCreate.mockResolvedValue({});
    mockUserUpdate.mockResolvedValue({});

    mockUserFindUnique.mockImplementation(
      (args: { select: Record<string, boolean> }) => {
        const keys = Object.keys(args.select);
        if (keys.includes("accountDeletionRequestedAt") && keys.length === 1) {
          return Promise.resolve({ accountDeletionRequestedAt: null });
        }
        return Promise.resolve({
          id: "u1",
          username: "tester",
          role: "USER",
          email: "t@example.com",
        });
      },
    );

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        accountDeletionToken: {
          deleteMany: mockTokDeleteMany,
          findUnique: mockTokFindUnique,
          create: mockTokCreate,
        },
        user: { update: mockUserUpdate },
      };
      return fn(tx);
    });
  });

  it("sends email when user has email", async () => {
    const result = await requestAccountDeletionCode("u1");

    expect(result).toEqual({ success: true });
    expect(mockTokDeleteMany).toHaveBeenCalled();
    expect(mockTokCreate).toHaveBeenCalled();
    expect(mockSendDeletionEmail).toHaveBeenCalledWith("t@example.com", expect.any(String));
  });

  it("rejects when email missing", async () => {
    mockUserFindUnique.mockImplementation(
      (args: { select: Record<string, boolean> }) => {
        const keys = Object.keys(args.select);
        if (keys.includes("accountDeletionRequestedAt") && keys.length === 1) {
          return Promise.resolve({ accountDeletionRequestedAt: null });
        }
        return Promise.resolve({
          id: "u1",
          username: "tester",
          role: "USER",
          email: null,
        });
      },
    );

    const result = await requestAccountDeletionCode("u1");

    expect(result.success).toBe(false);
    expect(result).toMatchObject({ code: "FORBIDDEN" });
    expect(mockSendDeletionEmail).not.toHaveBeenCalled();
  });

  it("rejects when throttled", async () => {
    mockUserFindUnique.mockImplementation(
      (args: { select: Record<string, boolean> }) => {
        const keys = Object.keys(args.select);
        if (keys.includes("accountDeletionRequestedAt") && keys.length === 1) {
          return Promise.resolve({ accountDeletionRequestedAt: new Date() });
        }
        return Promise.resolve({
          id: "u1",
          username: "tester",
          role: "USER",
          email: "t@example.com",
        });
      },
    );

    const result = await requestAccountDeletionCode("u1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Подождите");
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
