import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lockActor: vi.fn(),
  lockPartner: vi.fn(),
  actor: vi.fn(),
  partner: vi.fn(),
  earned: vi.fn(),
  reserved: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
      $queryRaw: mocks.lockActor,
      $executeRaw: mocks.lockPartner,
      user: { findUnique: mocks.actor },
      partnerProfile: { findUnique: mocks.partner },
      partnerCommission: { aggregate: mocks.earned },
      partnerPayout: { aggregate: mocks.reserved, create: mocks.create },
    }),
  },
}));

import { markPartnerBalancePaidAdmin } from "./adminPartnerService";

describe("markPartnerBalancePaidAdmin uses shared payout locking", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.lockActor.mockResolvedValue([{ "?column?": 1 }]);
    mocks.lockPartner.mockResolvedValue(1);
    mocks.actor.mockResolvedValue({ role: "ADMIN" });
    mocks.partner.mockResolvedValue({ userId: "owner-1" });
    mocks.earned.mockResolvedValue({ _sum: { amountKopecks: 25000 } });
    mocks.reserved.mockResolvedValue({ _sum: { amountKopecks: 10000 } });
    mocks.create.mockResolvedValue({ id: "paid-1" });
  });

  it("blocks unauthorized actor before querying or writing balances", async () => {
    mocks.actor.mockResolvedValue({ role: "MODERATOR" });
    expect(await markPartnerBalancePaidAdmin({
      actorId: "mod-1", partnerId: "partner-1",
    })).toEqual({ success: false, error: "Недостаточно прав" });
    expect(mocks.lockActor).toHaveBeenCalled();
    expect(mocks.lockPartner).not.toHaveBeenCalled();
    expect(mocks.earned).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("uses partner userId for the same advisory lock as self-service payout", async () => {
    const result = await markPartnerBalancePaidAdmin({
      actorId: "admin-1", partnerId: "partner-1",
    });
    expect(result).toEqual({
      success: true, payoutId: "paid-1", amountKopecks: 15000,
    });
    expect(mocks.lockPartner).toHaveBeenCalledTimes(1);
    expect(mocks.lockPartner.mock.calls[0][1]).toBe("partner-payout:owner-1");
    expect(mocks.reserved).toHaveBeenCalledWith({
      where: { partnerId: "partner-1", status: { in: ["PENDING", "PAID"] } },
      _sum: { amountKopecks: true },
    });
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        partnerId: "partner-1", status: "PAID", amountKopecks: 15000,
      }),
    });
  });

  it("rejects an already fully reserved payout without a write", async () => {
    mocks.reserved.mockResolvedValue({ _sum: { amountKopecks: 25000 } });
    const result = await markPartnerBalancePaidAdmin({
      actorId: "admin-1", partnerId: "partner-1",
    });
    expect(result).toMatchObject({ success: false });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns not found without locking a nonexistent partner", async () => {
    mocks.partner.mockResolvedValue(null);
    expect(await markPartnerBalancePaidAdmin({
      actorId: "admin-1", partnerId: "missing",
    })).toEqual({ success: false, error: "Партнёр не найден" });
    expect(mocks.lockPartner).not.toHaveBeenCalled();
  });
});
