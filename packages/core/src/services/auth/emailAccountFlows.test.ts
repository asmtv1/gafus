import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  deleteTokens: vi.fn(),
  createToken: vi.fn(),
  updateUser: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    $transaction: async (callback: (tx: unknown) => Promise<void>) =>
      callback({
        passwordResetToken: { deleteMany: mocks.deleteTokens, create: mocks.createToken },
        user: { updateMany: mocks.updateUser },
      }),
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

vi.mock("./transactionalAuthMail", () => ({
  getPublicWebBaseUrl: () => "https://gafus.ru",
  sendPasswordResetLinkEmail: mocks.sendEmail,
}));

import { sendPasswordResetRequestByEmail } from "./emailAccountFlows";

describe("sendPasswordResetRequestByEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateUser.mockResolvedValue({ count: 1 });
    mocks.findUser.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      passwordResetRequestedAt: null,
    });
  });

  it("хранит только хеш и отправляет исходный одноразовый токен в письме", async () => {
    await sendPasswordResetRequestByEmail("test@example.com");

    const resetUrl = mocks.sendEmail.mock.calls[0][1] as string;
    const rawToken = new URL(resetUrl).searchParams.get("token");
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mocks.createToken).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        token: `sha256:${createHash("sha256").update(rawToken!).digest("hex")}`,
        expiresAt: expect.any(Date),
      },
    });
    expect(mocks.createToken.mock.calls[0][0].data.token).not.toBe(rawToken);
  });

  it("failed email leaves old token valid and reopens the throttle for retry", async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error("SYNTHETIC_PROVIDER_OUTAGE"));
    await expect(sendPasswordResetRequestByEmail("test@example.com"))
      .rejects.toThrow("SYNTHETIC_PROVIDER_OUTAGE");
    // Cleanup can delete ONLY the new token, never a previously delivered link.
    const staged = mocks.createToken.mock.calls[0][0].data.token as string;
    expect(mocks.deleteTokens).toHaveBeenCalledWith({
      where: { userId: "user-1", token: staged },
    });
    expect(mocks.deleteTokens).not.toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(mocks.updateUser).toHaveBeenCalledTimes(2);
    expect(mocks.updateUser.mock.calls[1][0]).toMatchObject({
      where: { id: "user-1", passwordResetRequestedAt: expect.any(Date) },
      data: { passwordResetRequestedAt: null },
    });
  });

  it("в течение двух минут не создаёт новое письмо или токен", async () => {
    mocks.findUser.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      passwordResetRequestedAt: new Date(),
    });

    await sendPasswordResetRequestByEmail("test@example.com");

    expect(mocks.deleteTokens).not.toHaveBeenCalled();
    expect(mocks.createToken).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
