import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  policy: vi.fn(),
  exists: vi.fn(),
  toggle: vi.fn(),
}));
vi.mock("@gafus/core/services/article", () => ({
  toggleArticleLikeWithMonetizedAccess: m.policy,
}));
vi.mock("@gafus/article-server/likes", () => ({
  articleExists: m.exists,
  toggleArticleLikeAtomic: m.toggle,
}));
import { toggleArticleLikeWithMonetizedAccess } from "./article-like";

describe("Article like composition must bind the original SQL pair through Core paywall", () => {
  const input = { userId: "owner-A", articleId: "article-A", platform: "IOS" as const };

  it("supplies the exact atomic and existence adapters to the policy", async () => {
    m.policy.mockResolvedValueOnce(true);
    expect(await toggleArticleLikeWithMonetizedAccess(input)).toBe(true);
    expect(m.policy).toHaveBeenCalledExactlyOnceWith(input, {
      articleExists: m.exists,
      toggleArticleLikeAtomic: m.toggle,
    });
    expect(m.exists).not.toHaveBeenCalled();
    expect(m.toggle).not.toHaveBeenCalled();
  });

  it("does not handle a denied Core entitlement by touching SQL directly", async () => {
    vi.clearAllMocks();
    const denied = new Error("SUBSCRIPTION_OR_CREDITS_REQUIRED");
    m.policy.mockRejectedValueOnce(denied);
    await expect(toggleArticleLikeWithMonetizedAccess(input)).rejects.toBe(denied);
    expect(m.exists).not.toHaveBeenCalled();
    expect(m.toggle).not.toHaveBeenCalled();
  });
});
