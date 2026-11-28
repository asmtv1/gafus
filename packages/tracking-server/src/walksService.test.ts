import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  findUser: vi.fn(),
  execute: vi.fn(), query: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: {
  user: { findUnique: mocked.findUser }, $queryRaw: mocked.query, $transaction: mocked.transaction,
} }));
import { assertWalkHistoryAccess, syncCompletedDogWalks } from "./walksService.js";

beforeEach(() => {
  vi.resetAllMocks();
  mocked.execute.mockResolvedValue(1);
  mocked.query.mockResolvedValue([]);
  mocked.transaction.mockImplementation(fn => fn({ $executeRaw: mocked.execute }));
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
    expect(mocked.findUser).toHaveBeenCalledTimes(1);
    expect(mocked.execute).toHaveBeenCalledTimes(2);
    const [sql, owner, payload, markerOwner] = mocked.execute.mock.calls[1];
    expect(owner).toBe("jwt-actor");
    expect(markerOwner).toBe(owner);
    expect(JSON.parse(payload)).toMatchObject([{ clientId: "fb2f0e7b-0c4d-4918-b518-45ed15ca19e2" }]);
    expect(sql.join("?")).toContain('ON CONFLICT ("userId", "clientId") DO UPDATE');
    const [historySql, historyOwner, tombstoneOwner] = mocked.query.mock.calls[0];
    expect(historyOwner).toBe("jwt-actor");
    expect(tombstoneOwner).toBe(historyOwner);
    expect(historySql.join("?")).toContain('w."clientId" NOT IN (');
    expect(historySql.join("?")).toContain('SELECT d."clientId" FROM "DogWalkTombstone" d WHERE d."userId" = ?');
    expect(historySql.join("?")).toContain(') ORDER BY w."startedAt" DESC, w."clientId" DESC LIMIT 2000');
  });
});
