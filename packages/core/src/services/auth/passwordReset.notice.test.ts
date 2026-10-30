import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  transaction: vi.fn(),
  notice: vi.fn(),
  bcrypt: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: { $transaction: mock.transaction },
}));
vi.mock("bcryptjs", () => ({ default: { hash: mock.bcrypt } }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: mock.logError }),
}));
vi.mock("./transactionalAuthMail", () => ({
  sendPasswordChangedNoticeEmail: mock.notice,
}));

import { resetPasswordByToken, resetPasswordByShortCode } from "./passwordReset";

function txFixture(email = "owner@example.test") {
  return {
    passwordResetToken: {
      findUnique: vi.fn().mockResolvedValue({
        id: "receipt-1", userId: "owner-1", expiresAt: new Date(Date.now() + 60_000),
      }),
      delete: vi.fn().mockResolvedValue({ id: "receipt-1" }),
    },
    user: { update: vi.fn().mockResolvedValue({ email }) },
    refreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mock.bcrypt.mockResolvedValue("hashed-bcrypt-12");
  mock.notice.mockResolvedValue(undefined);
});

describe("reset notices are post-commit and do not change auth semantics", () => {
  it.each(["token", "short-code"])("%s: sends only after password+session revocation commits", async (flow) => {
    const tx = txFixture();
    let committed = false;
    mock.transaction.mockImplementation(async (handler: (tx: typeof tx) => Promise<unknown>) => {
      const result = await handler(tx);
      expect(tx.refreshToken.updateMany).toHaveBeenCalledExactlyOnceWith({
        where: { userId: "owner-1", revokedAt: null }, data: { revokedAt: expect.any(Date) },
      });
      expect(mock.notice).not.toHaveBeenCalled();
      committed = true;
      return result;
    });
    if (flow === "token") await resetPasswordByToken("valid-token", "NewPass9");
    else await resetPasswordByShortCode("valid-short-code", "NewPass9");
    expect(committed).toBe(true);
    expect(mock.notice).toHaveBeenCalledExactlyOnceWith("owner@example.test");
    expect(tx.passwordResetToken.delete).toHaveBeenCalledTimes(1);
  });

  it("mailer failure does not acknowledge a reset failure after commit", async () => {
    mock.transaction.mockImplementation(async (handler: (tx: ReturnType<typeof txFixture>) => Promise<unknown>) => {
      return handler(txFixture());
    });
    mock.notice.mockRejectedValueOnce(new Error("SMTP_PROVIDER_INTERNAL"));
    await expect(resetPasswordByToken("valid-token", "NewPass9")).resolves.toBeUndefined();
    expect(mock.logError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mock.logError.mock.calls)).not.toContain("SMTP_PROVIDER_INTERNAL");
  });

  it("never sends a change notice when token consumption transaction fails", async () => {
    mock.transaction.mockRejectedValueOnce(new Error("SQL_ABORT"));
    await expect(resetPasswordByToken("bad-token", "NewPass9")).rejects.toThrow("SQL_ABORT");
    expect(mock.notice).not.toHaveBeenCalled();
  });
});
