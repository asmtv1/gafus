import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), lock: vi.fn(), role: vi.fn(), bump: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
import { refreshCourseContentRevision } from "./cacheRevisionService";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ role: "MODERATOR" });
  mocks.lock.mockResolvedValue([{ id: "actor" }]);
  mocks.bump.mockResolvedValue([{ revision: 42n }]);
  mocks.transaction.mockImplementation(async callback => callback({
    user: { findUnique: mocks.role },
    $queryRaw: vi.fn().mockImplementationOnce(() => mocks.lock())
      .mockImplementationOnce(() => mocks.bump()),
  }));
});

describe("atomic course revision invalidation", () => {
  it("holds current-role check and revision bump in the same transaction", async () => {
    expect(await refreshCourseContentRevision("actor")).toBe("42");
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.lock).toHaveBeenCalledOnce();
    expect(mocks.role).toHaveBeenCalledExactlyOnceWith({
      where: { id: "actor" }, select: { role: true },
    });
    expect(mocks.bump).toHaveBeenCalledOnce();
  });
  it("rejects revoked actor without touching revision", async () => {
    mocks.role.mockResolvedValue({ role: "USER" });
    await expect(refreshCourseContentRevision("actor")).rejects.toThrow("FORBIDDEN");
    expect(mocks.bump).not.toHaveBeenCalled();
  });
  it("returns null when authoritative revision row is missing", async () => {
    mocks.bump.mockResolvedValue([]);
    await expect(refreshCourseContentRevision("actor")).resolves.toBeNull();
  });
  it("does not acknowledge failed SQL", async () => {
    mocks.bump.mockRejectedValue(new Error("DB_UNAVAILABLE"));
    await expect(refreshCourseContentRevision("actor")).rejects.toThrow("DB_UNAVAILABLE");
  });
});
