import { describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: {} }));
vi.mock("@gafus/entitlements-server/policy-reads", () => ({
  hasPaidChatDisplaySubscription: mocked.read,
}));
import { readPaidChatDisplayEntitlement } from "./profileRows";

describe("profile chat display entitlement adapter", () => {
  it("forwards the exact actor ID and clock to the canonical entitlement policy", async () => {
    const now = new Date("2026-11-11T12:00:00Z");
    mocked.read.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await readPaidChatDisplayEntitlement("actor-1", now)).toBe(true);
    expect(await readPaidChatDisplayEntitlement("actor-2", now)).toBe(false);
    expect(mocked.read.mock.calls).toEqual([
      ["actor-1", now],
      ["actor-2", now],
    ]);
  });
  it("does not silently grant a badge when the source fails", async () => {
    mocked.read.mockRejectedValueOnce(new Error("STORAGE_FAILURE"));
    await expect(readPaidChatDisplayEntitlement("actor-1", new Date())).rejects.toThrow(
      "STORAGE_FAILURE",
    );
  });
});
