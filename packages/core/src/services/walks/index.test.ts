import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  findUser: vi.fn(),
  upsert: vi.fn(),
  findMany: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: {
  user: { findUnique: mocked.findUser },
  dogWalkRecord: { upsert: mocked.upsert, findMany: mocked.findMany },
  $transaction: mocked.transaction,
} }));
import { assertWalkHistoryAccess, syncCompletedDogWalks } from "./index.js";

beforeEach(() => {
  mocked.findUser.mockReset();
  mocked.upsert.mockReset().mockResolvedValue({});
  mocked.findMany.mockReset().mockResolvedValue([]);
  mocked.transaction.mockReset().mockImplementation((promises: Promise<unknown>[]) => Promise.all(promises));
});

describe("dog walk persisted owner access", () => {
  it("permits any existing account", async () => {
    mocked.findUser.mockResolvedValue({ id: "user-id" });
    await expect(assertWalkHistoryAccess("user-id")).resolves.toBeUndefined();
    expect(mocked.findUser).toHaveBeenCalledWith({
      where: { id: "user-id" }, select: { id: true },
    });
  });

  it("rejects an unavailable/deleted owner", async () => {
    mocked.findUser.mockResolvedValue(null);
    await expect(assertWalkHistoryAccess("missing")).rejects.toThrow("WALKS_FORBIDDEN");
  });

  it("upserts by compound owner and stable phone ID", async () => {
    mocked.findUser.mockResolvedValue({ id: "jwt-actor" });
    await syncCompletedDogWalks("jwt-actor", [{
      clientId: "fb2f0e7b-0c4d-4918-b518-45ed15ca19e2",
      startedAt: "2026-11-05T09:00:00Z",
      finishedAt: "2026-11-05T10:00:00Z",
      durationSeconds: 1200,
      steps: 2500,
      estimatedMeters: 2000,
      timerMode: "stopwatch",
      incompleteSteps: false,
    }]);
    const param = mocked.upsert.mock.calls[0][0];
    expect(param.where.userId_clientId).toEqual({
      userId: "jwt-actor", clientId: "fb2f0e7b-0c4d-4918-b518-45ed15ca19e2",
    });
    expect(param.create.userId).toBe("jwt-actor");
    expect(mocked.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "jwt-actor" },
    }));
  });
});
