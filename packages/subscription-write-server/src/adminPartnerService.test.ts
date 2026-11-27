import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  actor: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  raw:vi.fn(),
  transaction:vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  Prisma:{sql:(strings:TemplateStringsArray,...values:unknown[])=>({strings:[...strings],values}),empty:{strings:[""],values:[]}},
  prisma: {
    $transaction:mock.transaction,
    user: { findUnique: (...args: unknown[]) => mock.actor(...args) },
    partnerProfile: {
      findMany: (...args: unknown[]) => mock.list(...args),
      findUnique: (...args: unknown[]) => mock.detail(...args),
    },
  },
}));

import { listPartnerAdminBalances, getPartnerAdminBalanceDetail, listPartnerAdminBalancePage, getPartnerAdminBalanceDetailPage } from "./adminPartnerService";

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

describe("paged partner balances",()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    mock.actor.mockResolvedValue({role:"ADMIN"});
    mock.transaction.mockImplementation(async fn=>fn({user:{findUnique:mock.actor},$queryRaw:mock.raw}));
  });
  it("returns exact ledger sum including refunds and excludes rejected payouts by SQL predicate",async()=>{
    mock.raw.mockResolvedValueOnce([{total:51n}]).mockResolvedValueOnce([{
      id:"p",userId:"u",username:"dog",email:null,fullName:null,isActive:true,referralCode:"DOG",
      earned:20000n,reserved:10000n,referrals:1n,
    }]);
    const page=await listPartnerAdminBalancePage("admin",{page:2,pageSize:25,search:"dog%"});
    expect(page.pagination).toEqual({page:2,pageSize:25,search:"dog%",total:51});
    expect(page.items[0]).toMatchObject({availableKopecks:10000,earnedRub:200,reservedRub:100,referrals:1});
    expect(mock.list).not.toHaveBeenCalled();
    expect(mock.raw.mock.calls[1].slice(-2)).toEqual([25,25]);
    expect(JSON.stringify(mock.raw.mock.calls[0])).toContain("dog%");
    expect(mock.raw.mock.calls[1][0].join("")).toContain("q.status IN ('PENDING','PAID')");
    expect(mock.transaction.mock.calls[0][1]).toEqual({isolationLevel:"RepeatableRead"});
  });
  it("rechecks DB role before financial reads and rejects unbounded pages",async()=>{
    mock.actor.mockResolvedValueOnce({role:"MODERATOR"});
    await expect(listPartnerAdminBalancePage("m",{page:1,pageSize:25,search:""})).rejects.toThrow("FORBIDDEN");
    expect(mock.raw).not.toHaveBeenCalled();
    await expect(listPartnerAdminBalancePage("admin",{page:1,pageSize:1000,search:""})).rejects.toThrow("INVALID_PAGE");
  });
});

it("bounds referral and payout history independently without truncating ledger totals",async()=>{
  const sum=vi.fn().mockResolvedValue({_sum:{amountKopecks:20000}});
  const referrals=vi.fn().mockResolvedValue([{id:"r"}]), payouts=vi.fn().mockResolvedValue([{id:"p"}]);
  mock.actor.mockResolvedValue({role:"ADMIN"});mock.detail.mockResolvedValue(profile);
  mock.transaction.mockImplementation(async fn=>fn({user:{findUnique:mock.actor},partnerProfile:{findUnique:mock.detail},
    partnerCommission:{aggregate:sum},partnerPayout:{aggregate:vi.fn().mockResolvedValue({_sum:{amountKopecks:10000}}),
      count:vi.fn().mockResolvedValue(99),findMany:payouts},
    partnerReferral:{count:vi.fn().mockResolvedValue(51),findMany:referrals}}));
  const page=await getPartnerAdminBalanceDetailPage("admin","partner-1",{referralsPage:2,payoutsPage:3,pageSize:25});
  expect(page).toMatchObject({availableKopecks:10000,history:{referralsPage:2,payoutsPage:3,pageSize:25,referralsTotal:51,payoutsTotal:99}});
  expect(referrals.mock.calls[0][0]).toMatchObject({skip:25,take:25});
  expect(payouts.mock.calls[0][0]).toMatchObject({skip:50,take:25});
  expect(sum).toHaveBeenCalledWith({where:{partnerId:"partner-1"},_sum:{amountKopecks:true}});
  expect(page).not.toHaveProperty("commissions");
});
