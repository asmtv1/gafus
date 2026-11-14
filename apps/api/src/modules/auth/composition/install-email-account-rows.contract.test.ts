import { describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  readReset: vi.fn(async (_email: string) => null),
  readChange: vi.fn(async (_userId: string) => null),
}));
vi.mock("@gafus/identity-write-server/email-account-rows", () => ({
  readPasswordResetRequestUser: m.readReset,
  claimPasswordResetEmailToken: vi.fn(),
  rollbackFailedPasswordResetEmailToken: vi.fn(),
  retireOlderPasswordResetEmailTokens: vi.fn(),
  readEmailChangeAccount: m.readChange,
  readEmailOwner: vi.fn(),
  stageEmailChange: vi.fn(),
  rollbackUndeliveredEmailChange: vi.fn(),
  retireOlderEmailChangeTokens: vi.fn(),
  consumeEmailChangeConfirmation: vi.fn(),
}));

describe("API email-account SQL composition", () => {
  it("keeps anti-enumeration and owner lookup delegated to Persistence", async () => {
    const core = await import("@gafus/core/services/auth");
    await import("./install-email-account-rows");
    await expect(core.sendPasswordResetRequestByEmail("unknown@example.invalid"))
      .resolves.toBeUndefined();
    expect(m.readReset).toHaveBeenCalledWith("unknown@example.invalid");
    await expect(core.requestEmailChange("owner-A", "new@example.invalid"))
      .rejects.toThrow("Пользователь не найден");
    expect(m.readChange).toHaveBeenCalledWith("owner-A");
  });
});
