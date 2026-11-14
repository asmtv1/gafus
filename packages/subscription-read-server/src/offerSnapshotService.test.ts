import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ settings: vi.fn(), user: vi.fn(), update: vi.fn(), create: vi.fn() }));
vi.mock("@gafus/prisma", () => ({prisma:{
  appSubscriptionSettings:{findUnique:m.settings},
  user:{findUnique:m.user,update:m.update,create:m.create},
}}));
import { getSubscriptionOfferDbSnapshot } from "./offerSnapshotService.js";

beforeEach(() => {
  vi.clearAllMocks();
  m.settings.mockResolvedValue({monthlyEnabled:true});
  m.user.mockResolvedValue({appleAppAccountToken:"persisted-token",savedRegistrationPromoCode:null});
});
describe("subscription paywall owner-scoped read adapter", () => {
  it("selects only the authenticated owner and whitelisted offer fields", async () => {
    const result=await getSubscriptionOfferDbSnapshot("owner-one");
    expect(result.appleAppAccountToken).toBe("persisted-token");
    expect(m.user).toHaveBeenCalledExactlyOnceWith({
      where: {id:"owner-one"},
      select: { appleAppAccountToken:true, savedRegistrationPromoCode: {
        select:{code:true,isActive:true,archivedAt:true},
      }},
    });
    expect(m.settings).toHaveBeenCalledOnce();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("returns null for missing Apple token rather than creating a UUID", async () => {
    m.user.mockResolvedValueOnce({appleAppAccountToken:null,savedRegistrationPromoCode:null});
    expect((await getSubscriptionOfferDbSnapshot("owner-new")).appleAppAccountToken).toBeNull();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("fails closed before hitting the database if actor identity is missing", async () => {
    await expect(getSubscriptionOfferDbSnapshot("")).rejects.toThrow("SUBSCRIPTION_OFFER_OWNER_REQUIRED");
    expect(m.user).not.toHaveBeenCalled();
    expect(m.settings).not.toHaveBeenCalled();
  });
  it("does not mix owner tokens across subsequent reads", async () => {
    m.user.mockResolvedValueOnce({appleAppAccountToken:"apple-A",savedRegistrationPromoCode:null})
      .mockResolvedValueOnce({appleAppAccountToken:"apple-B",savedRegistrationPromoCode:null});
    expect((await getSubscriptionOfferDbSnapshot("actor-A")).appleAppAccountToken).toBe("apple-A");
    expect((await getSubscriptionOfferDbSnapshot("actor-B")).appleAppAccountToken).toBe("apple-B");
    expect(m.user.mock.calls.map(c=>c[0].where.id)).toEqual(["actor-A","actor-B"]);
  });
});
