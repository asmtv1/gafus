/** AG1 existing Gafus wallet status/history read audit: mock Prisma no mutations. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  settings: vi.fn(), balance: vi.fn(), rewards: vi.fn(), transactions: vi.fn(),
  create: vi.fn(), update: vi.fn(), upsert: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: {
  gafusSettings: { findUnique: m.settings, upsert: m.upsert },
  gafusWallet: { findUnique: m.balance, create: m.create, upsert: m.upsert },
  gafusRewardEvent: { findMany: m.rewards },
  gafusTransaction: { findMany: m.transactions, create: m.create, update: m.update },
  $transaction: m.transaction,
} }));
import { getGafusStatus } from "./statusService";
import { listGafusTransactions } from "./walletService";
import { DEFAULT_GAFUS_SETTINGS } from "./settingsService";
const now = new Date("2026-10-18T04:00:00.000Z");
const ledger = (id: string, userId = "owner-A") => ({
  id, userId, kind: "EARN", delta: 1, balanceAfter: 1,
  createdAt: now, rewardKind: "POST_PUBLISHED", sourceEntityType: "FEED_POST",
  sourceEntityId: "synthetic-post", targetKey: null,
});
beforeEach(() => {
  vi.clearAllMocks();
  m.settings.mockResolvedValue(null);
  m.balance.mockResolvedValue(null);
  m.rewards.mockResolvedValue([]);
  m.transactions.mockResolvedValue([]);
});
const expectNoWrites = () => {
  expect(m.upsert).not.toHaveBeenCalled();
  expect(m.create).not.toHaveBeenCalled();
  expect(m.update).not.toHaveBeenCalled();
  expect(m.transaction).not.toHaveBeenCalled();
};
describe("G1 Wallet existing status/history Core is pure SELECT", () => {
  it("W01 empty wallet STATUS returns zero and default rule, never upsert", async () => {
    const dto = await getGafusStatus("owner-A", now);
    expect(dto.wallet.balance).toBe(0);
    expect(dto.activity).toMatchObject({ earned: 0, limit: 3, remaining: 3 });
    expect(dto.enabled).toMatchObject({ economy: true, earning: true, spending: true });
    expect(m.balance).toHaveBeenCalledWith({
      where: { userId: "owner-A" }, select: { balance: true },
    });
    expect(m.settings).toHaveBeenCalledWith({ where: { key: "default" } });
    expect(m.rewards).toHaveBeenCalledWith({
      where: { userId: "owner-A", rewardClass: "ACTIVITY", decision: "GRANTED",
        occurredAt: { gt: new Date(now.getTime() - 86400 * 1000), lte: now } },
      select: { amount: true, occurredAt: true }, orderBy: { occurredAt: "asc" },
    });
    expectNoWrites();
  });
  it("W02 activity earned/rolling reset derives from read events, no awards", async () => {
    m.balance.mockResolvedValueOnce({ balance: 6 });
    m.rewards.mockResolvedValueOnce([
      { amount: 1, occurredAt: new Date("2026-10-17T09:00:00Z") },
      { amount: 2, occurredAt: new Date("2026-10-17T10:00:00Z") },
    ]);
    const dto = await getGafusStatus("owner-B", now);
    expect(dto.wallet.balance).toBe(6);
    expect(dto.activity.remaining).toBe(0);
    expect(dto.activity.nextCapacityAt).toBe("2026-10-18T09:00:00.000Z");
    expectNoWrites();
  });
  it("W03 explicit settings disabled is displayed, GET does not change flags", async () => {
    m.settings.mockResolvedValueOnce({
      ...DEFAULT_GAFUS_SETTINGS, economyEnabled: false, earningEnabled: false,
      spendingEnabled: false, revision: 8,
    });
    const dto=await getGafusStatus("owner-A",now);
    expect(dto.enabled).toEqual({ economy: false, earning: false, spending: false });
    expect(dto.settingsRevision).toBe(8);
    expectNoWrites();
  });
  it("W04 empty history => [] and null cursor, strictly user-scoped SELECT", async () => {
    const dto=await listGafusTransactions({ userId: "owner-A", limit: 20 });
    expect(dto).toEqual({ items: [], nextCursor: null });
    expect(m.transactions).toHaveBeenCalledWith({
      where: { userId: "owner-A" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 21,
    });
    expectNoWrites();
  });
  it("W05 history limit + one and owner scope retained with cursor", async () => {
    m.transactions.mockResolvedValueOnce([ledger("A"),ledger("B"),ledger("C")]);
    const page=await listGafusTransactions({ userId: "owner-A", cursor: "syn-cursor", limit:2 });
    expect(page.items.map((x) => x.id)).toEqual(["A","B"]);
    expect(page.nextCursor).toBe("B");
    expect(m.transactions).toHaveBeenCalledWith({
      where: { userId: "owner-A" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: { id: "syn-cursor" }, skip: 1, take: 3,
    });
    expectNoWrites();
  });
  it("W06 direct Core history enforces 1..100 size, no mutation", async () => {
    await listGafusTransactions({ userId:"owner-A", limit: -10 });
    await listGafusTransactions({ userId:"owner-A", limit:9999 });
    expect(m.transactions.mock.calls[0]?.[0]).toMatchObject({ take:2 });
    expect(m.transactions.mock.calls[1]?.[0]).toMatchObject({ take:101 });
    expectNoWrites();
  });
});
