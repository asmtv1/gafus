/** Next.js wrapper delegates to Core; SQL normalization belongs to identity-write-server.
 * Do not mock Prisma under Core now that owner-scoped server ports fail closed. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ phone: vi.fn(), consume: vi.fn() }));
import { getUserPhoneByUsername } from "@gafus/core/services/auth/passwordReset";
const port = {
  lookupPhoneByNormalizedUsername: (...args: unknown[]) => mock.phone(...args),
  consumePasswordResetReceipt: (...args: unknown[]) => mock.consume(...args),
  isReceiptUnavailableError: (_error: unknown) => false,
};
beforeEach(() => vi.clearAllMocks());

describe("getUserPhoneByUsername composed read", () => {
  it("returns a phone from the authorized server read port", async () => {
    mock.phone.mockResolvedValueOnce("+79001234567");
    expect(await getUserPhoneByUsername("testuser", port)).toBe("+79001234567");
    expect(mock.phone).toHaveBeenCalledExactlyOnceWith("testuser");
    expect(mock.consume).not.toHaveBeenCalled();
  });
  it("returns null for absent users, without any credential write", async () => {
    mock.phone.mockResolvedValueOnce(null);
    expect(await getUserPhoneByUsername("unknown", port)).toBeNull();
    expect(mock.consume).not.toHaveBeenCalled();
  });
  it("forwards original username to server normalization without duplicating policy", async () => {
    mock.phone.mockResolvedValueOnce("+79001234567");
    await getUserPhoneByUsername("  TestUser  ", port);
    expect(mock.phone).toHaveBeenCalledExactlyOnceWith("  TestUser  ");
  });
  it("fails closed on server errors instead of returning another account's phone", async () => {
    mock.phone.mockRejectedValueOnce(new Error("TEST_SERVER_UNAVAILABLE"));
    await expect(getUserPhoneByUsername("testuser", port)).rejects.toThrow("TEST_SERVER_UNAVAILABLE");
  });
});
