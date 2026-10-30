import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { PetCard } from "./petApi";
import { syncVerifiedPetCount } from "./petListCountSync";

const sample: PetCard[] = [
  { id: "pet_A", name: "Рекс", breed: "Метис", type: "DOG",
    showInProfile: true, preventionCount: 1, documentCount: 2 },
  { id: "pet_B", name: "Кошка", breed: "Метис", type: "CAT",
    showInProfile: false, preventionCount: 9, documentCount: 8 },
];
const listKey = ["pets", "mine", "owner_A"] as const;
function state() {
  const cache = new QueryClient();
  cache.setQueryData(CURRENT_USER_QUERY_KEY,
    { id: "owner_A", username: "owner", role: "USER" });
  cache.setQueryData(listKey, sample);
  return cache;
}
describe("compact pet count reconciliation only from confirmed owner GET", () => {
  it("updates one count of the exact owned pet without altering other rows", () => {
    const cache = state();
    syncVerifiedPetCount(cache, "owner_A", "pet_A", "preventionCount", 4);
    const current = cache.getQueryData<PetCard[]>(listKey)!;
    expect(current[0]).toEqual({ ...sample[0], preventionCount: 4 });
    expect(current[1]).toEqual(sample[1]);
    expect(current[0]?.documentCount).toBe(2);
    cache.clear();
  });
  it("never creates owner data after logout, stale principal or absent list", () => {
    const cache = state();
    cache.setQueryData(CURRENT_USER_QUERY_KEY, null);
    syncVerifiedPetCount(cache, "owner_A", "pet_A", "documentCount", 7);
    expect(cache.getQueryData(listKey)).toEqual(sample);
    cache.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "owner_B", username: "other", role: "USER" });
    syncVerifiedPetCount(cache, "owner_A", "pet_A", "documentCount", 7);
    expect(cache.getQueryData(listKey)).toEqual(sample);
    cache.removeQueries({ queryKey: listKey });
    syncVerifiedPetCount(cache, "owner_B", "pet_A", "documentCount", 7);
    expect(cache.getQueryData(listKey)).toBeUndefined();
    cache.clear();
  });
  it("rejects forged, negative, and unsafe counts and unknown pet ids", () => {
    const cache = state();
    for (const value of [NaN, -1, Infinity, 1_000_001, 1.5])
      syncVerifiedPetCount(cache, "owner_A", "pet_A", "documentCount", value);
    syncVerifiedPetCount(cache, "owner_A", "pet_Z", "documentCount", 7);
    expect(cache.getQueryData(listKey)).toEqual(sample);
    cache.clear();
  });
});
