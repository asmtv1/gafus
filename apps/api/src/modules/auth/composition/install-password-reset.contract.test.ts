import { describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  consume: vi.fn(async () => "owner@example.invalid" as string | null),
  phone: vi.fn(async () => null as string | null),
  hash: vi.fn(async () => "hashed-12"),
}));
vi.mock("@gafus/identity-write-server/password-reset", () => ({
  consumePasswordResetReceipt: fake.consume,
  lookupPhoneByNormalizedUsername: fake.phone,
  ResetReceiptUnavailableError: class ResetReceiptUnavailableError extends Error {},
}));
vi.mock("bcryptjs", () => ({ default: { hash: fake.hash } }));

describe("API password reset composition", () => {
  it("retains Core public invalid-token class while classifying server receipt failure", async () => {
    const core = await import("@gafus/core/services/auth");
    const { passwordResetPort } = await import("./password-reset-instance");
    const { ResetReceiptUnavailableError } = await import("@gafus/identity-write-server/password-reset");
    fake.consume.mockRejectedValueOnce(new ResetReceiptUnavailableError());
    await expect(core.resetPasswordByToken("old-token", "NewPass9", passwordResetPort))
      .rejects.toBeInstanceOf(core.InvalidPasswordResetTokenError);
    expect(fake.consume).toHaveBeenCalledTimes(1);
  });
});
