import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.transport }));
import { achievementsApi } from "./achievements";
beforeEach(() => vi.clearAllMocks());
describe("existing Hono achievements client guarded methods", () => {
  it("passes same ownerEpoch requestGuard on GET achievements and training dates", async () => {
    const guard = () => true;
    await achievementsApi.getAchievements(guard);
    await achievementsApi.getTrainingDates(guard);
    expect(m.transport.mock.calls).toEqual([
      ["/api/v1/achievements", { requestGuard: guard, suppressSubscriptionPaywall: true }],
      [
        "/api/v1/achievements/training-dates",
        { requestGuard: guard, suppressSubscriptionPaywall: true },
      ],
    ]);
  });
  it("existing no-arg callers remain source compatible", async () => {
    await achievementsApi.getAchievements();
    expect(m.transport.mock.calls[0][0]).toBe("/api/v1/achievements");
  });
});
