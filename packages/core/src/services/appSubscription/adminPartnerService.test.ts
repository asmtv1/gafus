import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  actor: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mock.actor(...args) },
    partnerProfile: {
      findMany: (...args: unknown[]) => mock.list(...args),
      findUnique: (...args: unknown[]) => mock.detail(...args),
    },
  },
}));

import { listPartnerAdminBalances, getPartnerAdminBalanceDetail } from "./adminPartnerService";

const profile = {
  id: "partner-1", userId: "u1", isActive: true, referralCode: "legacy",
  promoCode: { code: "DOG" },
  user: { id: "u1", username: "dog", email: "dog@example.org", profile: { fullName: "Партнёр" } },
  referrals: [{ id: "r1", buyerId: "buyer-1", createdAt: new Date() }],
  commissions: [
    { id: "c1", amountKopecks: 25000, kind: "EARNED", paymentId: "pay", createdAt: new Date() },
    { id: "c2", amountKopecks: -5000, kind: "REFUND_ADJUSTMENT", paymentId: "pay", createdAt: new Date() },
  ],
  payouts: [
    { id: "p1", amountKopecks: 10000, status: "PAID", requestedAt: new Date(), processedAt: new Date(), note: null },
    { id: "p2", amountKopecks: 3000, status: "REJECTED", requestedAt: new Date(), processedAt: null, note: null },
  ],
};

describe("admin partner balances in core", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.actor.mockResolvedValue({ role: "ADMIN" });
    mock.list.mockResolvedValue([profile]);
    mock.detail.mockResolvedValue(profile);
  });

  it("forbids non-admins before querying financial details", async () => {
    mock.actor.mockResolvedValue({ role: "MODERATOR" });
    await expect(listPartnerAdminBalances("moderator")).rejects.toThrow("FORBIDDEN");
    await expect(getPartnerAdminBalanceDetail("moderator", "partner-1")).rejects.toThrow("FORBIDDEN");
    expect(mock.list).not.toHaveBeenCalled();
    expect(mock.detail).not.toHaveBeenCalled();
  });

  it("uses signed commissions and only reserved payout statuses", async () => {
    const [result] = await listPartnerAdminBalances("admin");
    expect(result).toMatchObject({
      id: "partner-1", userId: "u1", referralCode: "DOG",
      earnedKopecks: 20000, reservedKopecks: 10000, availableKopecks: 10000,
      earnedRub: 200, reservedRub: 100, availableRub: 100, referrals: 1,
    });
  });

  it("returns full detail only to an administrator", async () => {
    const result = await getPartnerAdminBalanceDetail("admin", "partner-1");
    expect(result?.commissions).toHaveLength(2);
    expect(result?.payouts).toHaveLength(2);
    mock.detail.mockResolvedValueOnce(null);
    expect(await getPartnerAdminBalanceDetail("admin", "missing")).toBeNull();
  });
});
