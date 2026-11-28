import { describe, expect, it } from "vitest";
import { selectAppleSyncOwner } from "./appleSyncOwner";

const a = { id: "sub-a", userId: "a", user: { appleAppAccountToken: "token-a" } };
const b = { id: "sub-b", userId: "b", user: { appleAppAccountToken: "token-b" } };
const context = { candidates: [a, b], originalTransactionId: "chain", receipt: null };
const receipt = { userId: "a", subscriptionId: "sub-a", appleOriginalTransactionId: "chain" };
describe("Apple server reconciliation ownership", () => {
  it("never treats requested owner or original chain ID as proof when the chain is shared", () => {
    expect(selectAppleSyncOwner(context)).toBeNull();
    expect(selectAppleSyncOwner({ ...context, requestedUserId: "a" })).toBeNull();
    expect(selectAppleSyncOwner({ ...context, requestedSubscriptionId: "sub-a" })).toBeNull();
  });
  it("routes a new paid renewal to its signed account and refuses an old account's restore", () => {
    expect(selectAppleSyncOwner({ ...context, appAccountToken: "token-b" })).toBe(b);
    expect(selectAppleSyncOwner({ ...context, appAccountToken: "token-b", requestedUserId: "a" })).toBeNull();
    expect(selectAppleSyncOwner({ ...context, appAccountToken: "unknown" })).toBeNull();
  });
  it("binds a known receipt to its original owner and subscription", () => {
    expect(selectAppleSyncOwner({ ...context, receipt })).toBe(a);
    expect(selectAppleSyncOwner({ ...context, receipt, appAccountToken: "token-b" })).toBeNull();
    expect(selectAppleSyncOwner({ ...context, receipt: { ...receipt, appleOriginalTransactionId: "other" } })).toBeNull();
    expect(selectAppleSyncOwner({ ...context, receipt: { ...receipt, subscriptionId: "deleted" } })).toBeNull();
  });
  it("supports tokenless historical chains only when there is one candidate", () => {
    expect(selectAppleSyncOwner({ ...context, candidates: [a] })).toBe(a);
    expect(selectAppleSyncOwner({ ...context, candidates: [a], requestedUserId: "b" })).toBeNull();
  });
});
