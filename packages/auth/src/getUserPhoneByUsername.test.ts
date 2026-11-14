/** Next.js wrapper delegates to Core; SQL normalization belongs to identity-write-server.
 * Do not mock Prisma under Core now that owner-scoped server ports fail closed. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ phone: vi.fn(), consume: vi.fn() }));
import { registerPasswordResetPort } from "@gafus/core/services/auth/passwordReset";
import { getUserPhoneByUsername } from "./getUserPhoneByUsername";
const port = {
  lookupPhoneByNormalizedUsername: (...args: unknown[]) => mock.phone(...args),
  consumePasswordResetReceipt: (...args: unknown[]) => mock.consume(...args),
  isReceiptUnavailableError: (_error: unknown) => false,
};
beforeAll(() => registerPasswordResetPort(port));
beforeEach(() => vi.clearAllMocks());

describe("getUserPhoneByUsername composed read", () => {
  it("returns a phone from the authorized server read port", async () => {
    mock.phone.mockResolvedValueOnce("+79001234567");
    expect(await getUserPhoneByUsername("testuser")).toBe("+79001234567");
    expect(mock.phone).toHaveBeenCalledExactlyOnceWith("testuser");
    expect(mock.consume).not.toHaveBeenCalled();
  });
  it("returns null for absent users, without any credential write", async () => {
    mock.phone.mockResolvedValueOnce(null);
    expect(await getUserPhoneByUsername("unknown")).toBeNull();
    expect(mock.consume).not.toHaveBeenCalled();
  });
  it("forwards original username to server normalization without duplicating policy", async () => {
    mock.phone.mockResolvedValueOnce("+79001234567");
    await getUserPhoneByUsername("  TestUser  ");
    expect(mock.phone).toHaveBeenCalledExactlyOnceWith("  TestUser  ");
  });
  it("fails closed on server errors instead of returning another account's phone", async () => {
    mock.phone.mockRejectedValueOnce(new Error("TEST_SERVER_UNAVAILABLE"));
    await expect(getUserPhoneByUsername("testuser")).rejects.toThrow("TEST_SERVER_UNAVAILABLE");
  });
});
