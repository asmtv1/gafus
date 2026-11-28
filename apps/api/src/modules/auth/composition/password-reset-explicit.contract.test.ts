/** The API passes one authoritative SQL receipt port per service invocation.
 * No import-order side effect is needed to consume a password reset token. */
import { describe, expect, it, vi } from "vitest";
import type { PasswordResetPorts } from "@gafus/core/services/auth";


describe("password reset explicit composition", () => {
  function reader(): PasswordResetPorts & { consumePasswordResetReceipt: ReturnType<typeof vi.fn> } {
    return {
      consumePasswordResetReceipt: vi.fn(async () => null),
      lookupPhoneByNormalizedUsername: vi.fn(async () => null),
      isReceiptUnavailableError: (e: unknown) => e instanceof RangeError,
    };
  }

  it("isolates independent readers, forwarding the SHA-256 proof to exactly one owner", async () => {
    const core = await import("@gafus/core/services/auth");
    const first = reader();
    const second = reader();
    await core.resetPasswordByToken("reset-token-a", "NewPass1", first);
    await core.resetPasswordByToken("reset-token-b", "NewPass2", second);
    expect(first.consumePasswordResetReceipt).toHaveBeenCalledTimes(1);
    expect(second.consumePasswordResetReceipt).toHaveBeenCalledTimes(1);
    expect(first.consumePasswordResetReceipt.mock.calls[0]?.[0]).toEqual({
      kind: "token", tokenHash: "sha256:de35ec4399f39c5e70b85b3dee0dce0cdd2e640ff780a473c763d2cd3f63d57c",
    });
    expect(second.consumePasswordResetReceipt.mock.calls[0]?.[0]).not.toEqual(first.consumePasswordResetReceipt.mock.calls[0]?.[0]);
    for (const adapter of [first, second]) {
      const digest = adapter.consumePasswordResetReceipt.mock.calls[0]?.[1];
      expect(digest).toMatch(/^\$2[aby]\$12\$/);
    }
  });

  it("fails closed without a reader and maps only trusted receipt-unavailable errors", async () => {
    const core = await import("@gafus/core/services/auth");
    await expect(core.resetPasswordByToken("unbound-token", "NewPass1", undefined!))
      .rejects.toThrow("PASSWORD_RESET_PORT_UNBOUND");
    const port = reader();
    port.consumePasswordResetReceipt.mockRejectedValueOnce(new RangeError("receipt consumed"));
    await expect(core.resetPasswordByToken("expired-token", "NewPass2", port))
      .rejects.toBeInstanceOf(core.InvalidPasswordResetTokenError);
    port.consumePasswordResetReceipt.mockRejectedValueOnce(new SyntaxError("SQL unavailable"));
    await expect(core.resetPasswordByToken("db-failure", "NewPass3", port))
      .rejects.toBeInstanceOf(SyntaxError);
  });
});
