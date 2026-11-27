import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const fake = vi.hoisted(() => ({
  hash: vi.fn(async () => "bcrypt-12"),
  mail: vi.fn(async () => {}),
  log: vi.fn(),
}));
vi.mock("bcryptjs", () => ({ default: { hash: fake.hash } }));
vi.mock("./transactionalAuthMail", () => ({ sendPasswordChangedNoticeEmail: fake.mail }));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: fake.log }) }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

function makePort() {
  class UnavailableReceipt extends Error {}
  return {
    consumePasswordResetReceipt: vi.fn(async () => "owner@example.invalid" as string | null),
    lookupPhoneByNormalizedUsername: vi.fn(async () => null as string | null),
    isReceiptUnavailableError: (e: unknown) => e instanceof UnavailableReceipt,
    UnavailableReceipt,
  };
}

describe("password-reset Core port preserves the public one-time semantics", () => {
  it("unbound adapter refuses credential changes and phone lookup without touching bcrypt or mail", async () => {
    const core = await import("./passwordReset");
    await expect(core.resetPasswordByToken("token-A", "NewPass9", undefined!))
      .rejects.toThrow("PASSWORD_RESET_PORT_UNBOUND");
    await expect(core.getUserPhoneByUsername("owner-A", undefined!))
      .rejects.toThrow("PASSWORD_RESET_PORT_UNBOUND");
    expect(fake.hash).not.toHaveBeenCalled();
    expect(fake.mail).not.toHaveBeenCalled();
  });
  it("hashes raw token, preserves exact proof and bcrypt cost 12", async () => {
    const core = await import("./passwordReset");
    const port = makePort();
    await core.resetPasswordByToken("token-A", "NewPass9", port);
    expect(fake.hash).toHaveBeenCalledExactlyOnceWith("NewPass9", 12);
    expect(port.consumePasswordResetReceipt).toHaveBeenCalledWith({
      kind: "token", tokenHash: `sha256:${createHash("sha256").update("token-A").digest("hex")}`,
    }, "bcrypt-12");
    expect(fake.mail).toHaveBeenCalledExactlyOnceWith("owner@example.invalid");
  });
  it("maps ONLY server-classified consumed/expired tokens to the same public errors", async () => {
    const core = await import("./passwordReset");
    const p = makePort();
    p.consumePasswordResetReceipt.mockRejectedValueOnce(new p.UnavailableReceipt());
    await expect(core.resetPasswordByToken("expired", "NewPass9", p))
      .rejects.toBeInstanceOf(core.InvalidPasswordResetTokenError);
    p.consumePasswordResetReceipt.mockRejectedValueOnce(new p.UnavailableReceipt());
    await expect(core.resetPasswordByShortCode("old-code", "NewPass9", p))
      .rejects.toThrow("Код недействителен или устарел");
    const sqlFault = new Error("SQL_ABORT");
    p.consumePasswordResetReceipt.mockRejectedValueOnce(sqlFault);
    await expect(core.resetPasswordByToken("token-A", "NewPass9", p))
      .rejects.toBe(sqlFault);
    expect(fake.mail).not.toHaveBeenCalled();
  });
  it("isolates two concurrently supplied adapters without global state", async () => {
    const core = await import("./passwordReset");
    const a = makePort(), b = makePort();
    await Promise.all([
      core.resetPasswordByToken("token-A", "NewPass9", a),
      core.resetPasswordByToken("token-B", "NewPass9", b),
    ]);
    expect(a.consumePasswordResetReceipt).toHaveBeenCalledOnce();
    expect(b.consumePasswordResetReceipt).toHaveBeenCalledOnce();
    expect(a.consumePasswordResetReceipt.mock.calls[0]).not.toEqual(b.consumePasswordResetReceipt.mock.calls[0]);
  });
});
