import { describe, expect, it, vi } from "vitest";
import { createListCynologistsApplication } from "./list-cynologists";

describe("AG1-001 consultation catalog dual-Core application orchestration", () => {
  it("retains ordered catalog then owner-eligibility calls, exact object identities", async () => {
    const order: string[] = [];
    const data = [{ id: "cyn-1", userId: "trainer-1", username: "trainer_1",
      displayName: null, avatarUrl: null, about: null, slotDurationMin: 45 }];
    const bookingEligibility = {
      canBook: true, reason: null, nextBookingAt: null, message: null,
    };
    const listListedCynologists = vi.fn(async () => {
      order.push("list");
      return data;
    });
    const getBookingEligibility = vi.fn(async (id: string) => {
      order.push("eligibility:" + id);
      return bookingEligibility;
    });
    const app = createListCynologistsApplication({
      listListedCynologists, getBookingEligibility,
    });
    const result = await app.execute({
      actorUserId: "owner-A",
      onCatalogLoaded: () => order.push("header"),
    });
    expect(order).toEqual(["list", "header", "eligibility:owner-A"]);
    expect(result).toEqual({ data, bookingEligibility });
    expect(result.data).toBe(data);
    expect(result.bookingEligibility).toBe(bookingEligibility);
    expect(listListedCynologists).toHaveBeenCalledOnce();
    expect(getBookingEligibility).toHaveBeenCalledExactlyOnceWith("owner-A");
  });

  it("when catalog read rejects, eligibility read is not performed", async () => {
    const failure = new Error("SYNTHETIC_CATALOG_FAILURE");
    const listListedCynologists = vi.fn().mockRejectedValue(failure);
    const getBookingEligibility = vi.fn();
    const onCatalogLoaded = vi.fn();
    await expect(createListCynologistsApplication({
      listListedCynologists, getBookingEligibility,
    }).execute({
      actorUserId: "owner-A",
      onCatalogLoaded,
    })).rejects.toBe(failure);
    expect(listListedCynologists).toHaveBeenCalledOnce();
    expect(onCatalogLoaded).not.toHaveBeenCalled();
    expect(getBookingEligibility).not.toHaveBeenCalled();
  });

  it("when owner eligibility rejects, propagates original error unchanged", async () => {
    const failure = new Error("SYNTHETIC_ELIGIBILITY_FAILURE");
    const data = [{ id: "cyn-1" }];
    const listListedCynologists = vi.fn().mockResolvedValue(data);
    const getBookingEligibility = vi.fn().mockRejectedValue(failure);
    const onCatalogLoaded = vi.fn();
    await expect(createListCynologistsApplication({
      listListedCynologists, getBookingEligibility,
    }).execute({
      actorUserId: "owner-B",
      onCatalogLoaded,
    })).rejects.toBe(failure);
    expect(listListedCynologists).toHaveBeenCalledOnce();
    expect(onCatalogLoaded).toHaveBeenCalledOnce();
    expect(getBookingEligibility).toHaveBeenCalledExactlyOnceWith("owner-B");
  });
});
