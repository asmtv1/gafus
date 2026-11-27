/** Tests the real Core reset workflow through its composed persistence receipt port.
 * SQL locking/revocation atomicity is covered by identity-write-server tests;
 * these transport tests must never bypass the port or access Prisma directly. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const m = vi.hoisted(() => ({ consume: vi.fn(), phone: vi.fn(), hash: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: (...args: unknown[]) => m.hash(...args) } }));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }) }));

import { resetPasswordByToken } from "@gafus/core/services/auth/passwordReset";
import { resetPasswordByShortCode } from "@gafus/core/services/auth/passwordReset";

class ReceiptUnavailable extends Error {}
const port = {
  consumePasswordResetReceipt: (...args: unknown[]) => m.consume(...args),
  lookupPhoneByNormalizedUsername: (...args: unknown[]) => m.phone(...args),
  isReceiptUnavailableError: (error: unknown) => error instanceof ReceiptUnavailable,
};
beforeEach(() => {
  vi.clearAllMocks();
  m.hash.mockResolvedValue("safe-bcrypt-hash");
  m.consume.mockResolvedValue(null);
});

const hashOf = (raw: string) => `sha256:${createHash("sha256").update(raw).digest("hex")}`;

describe("resetPasswordByToken (transport to Core receipt port)", () => {
  it("hashes password and hashes link token before one atomic receipt call", async () => {
    await resetPasswordByToken("valid-token", "newPassword", port);
    expect(m.hash).toHaveBeenCalledExactlyOnceWith("newPassword", 12);
    expect(m.consume).toHaveBeenCalledExactlyOnceWith(
      { kind: "token", tokenHash: hashOf("valid-token") }, "safe-bcrypt-hash",
    );
  });
  it("supports legacy 43-character issued link, without using raw token as hash", async () => {
    const legacy = "a".repeat(43);
    await resetPasswordByToken(legacy, "newPassword", port);
    expect(m.consume).toHaveBeenCalledExactlyOnceWith(
      { kind: "token", tokenHash: hashOf(legacy), legacyRawToken: legacy }, "safe-bcrypt-hash",
    );
  });
  it("never treats a stored SHA-256 hash as an old raw 43-character link", async () => {
    const databaseHash = `sha256:${"a".repeat(64)}`;
    m.consume.mockRejectedValueOnce(new ReceiptUnavailable());
    await expect(resetPasswordByToken(databaseHash, "newPassword", port)).rejects.toThrow(
      "Ссылка устарела или уже использована",
    );
    expect(m.consume).toHaveBeenCalledExactlyOnceWith(
      { kind: "token", tokenHash: hashOf(databaseHash) }, "safe-bcrypt-hash",
    );
  });
  it.each(["missing", "expired", "already-consumed"])("masks %s invalid receipts", async (token) => {
    m.consume.mockRejectedValueOnce(new ReceiptUnavailable());
    await expect(resetPasswordByToken(token, "newPassword", port)).rejects.toThrow(
      "Ссылка устарела или уже использована",
    );
    expect(m.consume).toHaveBeenCalledTimes(1);
  });
  it("preserves unexpected server errors without claiming a successful reset", async () => {
    m.consume.mockRejectedValueOnce(new Error("UNEXPECTED_DB_FAILURE"));
    await expect(resetPasswordByToken("valid-token", "password", port)).rejects.toThrow("UNEXPECTED_DB_FAILURE");
    expect(m.consume).toHaveBeenCalledTimes(1);
  });
});

describe("resetPasswordByShortCode (same receipt port)", () => {
  it("hashes password and passes the short code through exactly once", async () => {
    await resetPasswordByShortCode("123456", "newPassword", port);
    expect(m.hash).toHaveBeenCalledExactlyOnceWith("newPassword", 12);
    expect(m.consume).toHaveBeenCalledExactlyOnceWith(
      { kind: "shortCode", shortCode: "123456" }, "safe-bcrypt-hash",
    );
  });
  it("maps an unavailable code to the public denied error", async () => {
    m.consume.mockRejectedValueOnce(new ReceiptUnavailable());
    await expect(resetPasswordByShortCode("000000", "newPassword", port)).rejects.toThrow(
      "Код недействителен или устарел",
    );
    expect(m.consume).toHaveBeenCalledTimes(1);
  });
});
