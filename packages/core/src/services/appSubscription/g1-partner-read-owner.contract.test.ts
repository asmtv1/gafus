/**
 * AG1 ECON060: actual Core partner profile/dashboard read ownership,
 * with injected Prisma transaction/aggregation mocks. No real PG or payments.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m = vi.hoisted(() => ({
  tx: vi.fn(), profile: vi.fn(), commission: vi.fn(), payout: vi.fn(),
  referrals: vi.fn(),
}));
vi.mock("@gafus/prisma", async (importOriginal) => {
  const original = await importOriginal<typeof PrismaModule>();
  return { ...original, prisma: {
    ...original.prisma,
    $transaction: m.tx,
    partnerCommission: { aggregate: m.commission },
    partnerPayout: { aggregate: m.payout },
    partnerReferral: { count: m.referrals },
  } };
});
import {
  getPartnerDashboard, getPartnerProfile, PartnerProgramError,
} from "./partnerService";

const PRIVATE = "PRIVATE_BUYER_BANK_CARD_PAYMENT_DETAILS";
const profile = (userId: string, role = "PARTNER", hasPromo = true) => ({
  id: "PARTNER_" + userId,
  userId, isActive: userId !== "USER_B",
  user: { role, email: PRIVATE },
  bankDetails: PRIVATE,
  promoCode: hasPromo ? {
    id: "PROMO_" + userId, code: "CODE_" + userId,
    normalizedCode: "code_" + userId, isActive: true, archivedAt: null,
  } : null,
});
beforeEach(() => {
  vi.resetAllMocks();
  m.tx.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({ partnerProfile: { findUnique: m.profile } }),
  );
  m.profile.mockImplementation(async ({ where }: { where: { userId: string } }) =>
    profile(where.userId),
  );
  m.commission.mockImplementation(async ({ where }: { where: { partnerId: string } }) => ({
    _sum: { amountKopecks: where.partnerId === "PARTNER_USER_A" ? 25_000 : null },
  }));
  m.payout.mockImplementation(async ({ where }: { where: { partnerId: string } }) => ({
    _sum: { amountKopecks: where.partnerId === "PARTNER_USER_A" ? 5_000 : null },
  }));
  m.referrals.mockImplementation(async ({ where }: { where: { partnerId: string } }) =>
    where.partnerId === "PARTNER_USER_A" ? 4 : 0,
  );
});
describe("AG1 ECON060 actual getPartnerDashboard Core owner-scoped read", () => {
  it("actor A then B then A filters ALL aggregates by its DB profile ID", async () => {
    for (const [userId, amount, reserved, referrals] of [
      ["USER_A", 25_000, 5_000, 4],
      ["USER_B", 0, 0, 0],
      ["USER_A", 25_000, 5_000, 4],
    ] as const) {
      expect(await getPartnerDashboard(userId)).toEqual({
        referralCode: "CODE_" + userId,
        earnedKopecks: amount, reservedKopecks: reserved,
        availableKopecks: amount - reserved, referrals,
      });
    }
    expect(m.profile.mock.calls.map(([q]) => q.where.userId))
      .toEqual(["USER_A", "USER_B", "USER_A"]);
    for (const fn of [m.commission, m.payout, m.referrals]) {
      expect(fn.mock.calls.map(([q]) => q.where.partnerId))
        .toEqual(["PARTNER_USER_A", "PARTNER_USER_B", "PARTNER_USER_A"]);
    }
    expect(m.payout).toHaveBeenCalledWith({
      where: { partnerId: "PARTNER_USER_A", status: { in: ["PENDING", "PAID"] } },
      _sum: { amountKopecks: true },
    });
    expect(m.profile).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "USER_A" },
      include: expect.objectContaining({
        promoCode: { select: {
          id: true, code: true, normalizedCode: true, isActive: true, archivedAt: true,
        } },
        user: { select: { role: true } },
      }),
    }));
  });
  it("missing profile fails with PARTNER_REQUIRED before ANY aggregates", async () => {
    m.profile.mockResolvedValueOnce(null);
    await expect(getPartnerDashboard("USER_A"))
      .rejects.toMatchObject({ code: "PARTNER_REQUIRED" });
    expect(m.commission).not.toHaveBeenCalled();
    expect(m.payout).not.toHaveBeenCalled();
    expect(m.referrals).not.toHaveBeenCalled();
  });
  it.each(["USER", "MODERATOR", "ADMIN"])(
    "database role %s loses partner read access regardless of JWT role", async role => {
      m.profile.mockResolvedValueOnce(profile("USER_A", role));
      await expect(getPartnerDashboard("USER_A"))
        .rejects.toMatchObject({ code: "PARTNER_REQUIRED" });
      expect(m.commission).not.toHaveBeenCalled();
    },
  );
  it("legacy no promo preserves PARTNER_PROMO_REQUIRED without finance query", async () => {
    m.profile.mockResolvedValueOnce(profile("USER_A", "PARTNER", false));
    await expect(getPartnerDashboard("USER_A"))
      .rejects.toMatchObject({ code: "PARTNER_PROMO_REQUIRED" });
    expect(m.commission).not.toHaveBeenCalled();
  });
  it("inactive PARTNER profile remains readable; status comes from DB, no side effects", async () => {
    const p = await getPartnerProfile("USER_B");
    expect(p.isActive).toBe(false);
    expect(m.commission).not.toHaveBeenCalled();
    expect(m.payout).not.toHaveBeenCalled();
    expect(m.referrals).not.toHaveBeenCalled();
  });
  it("unexpected DB error propagates; no forged zero dashboard", async () => {
    m.commission.mockRejectedValueOnce(new Error(PRIVATE));
    await expect(getPartnerDashboard("USER_A")).rejects.toThrow(PRIVATE);
    expect(m.referrals).toHaveBeenCalledOnce();
  });
  it("known PartnerProgramError remains distinct domain error", () => {
    const error = new PartnerProgramError("PARTNER_REQUIRED");
    expect(error.code).toBe("PARTNER_REQUIRED");
  });
});
