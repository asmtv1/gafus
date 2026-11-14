import { beforeEach, describe, expect, it, vi } from "vitest";

import { SubscriptionOrCreditsRequiredError } from "../rewardedCredits";

const mockArticleExists = vi.fn();
const mockAtomicToggle = vi.fn();
const mockResolveArticleEntitlement = vi.fn();
const ports = {
  articleExists: (...args: [articleId: string]) => mockArticleExists(...args) as Promise<boolean>,
  toggleArticleLikeAtomic: (...args: [userId: string, articleId: string]) =>
    mockAtomicToggle(...args) as Promise<boolean>,
};

vi.mock("../rewardedCredits", () => ({
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {
    code = "SUBSCRIPTION_OR_CREDITS_REQUIRED" as const;
  },
}));

vi.mock("../contentAccess/policy", () => ({
  resolveArticleEntitlement: (...args: unknown[]) => mockResolveArticleEntitlement(...args),
}));

import { toggleArticleLikeWithMonetizedAccess } from "./articleLikeService";

describe("toggleArticleLikeWithMonetizedAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveArticleEntitlement.mockResolvedValue({ allowed: false, source: "DENIED" });
    mockArticleExists.mockResolvedValue(true);
    mockAtomicToggle.mockResolvedValue(true);
  });

  it("rejects a like without an active subscription", async () => {
    mockArticleExists.mockResolvedValue(true);
    await expect(
      toggleArticleLikeWithMonetizedAccess(
        {
          userId: "user-1",
          articleId: "article-1",
          platform: "WEB_DESKTOP",
        },
        ports,
      ),
    ).rejects.toBeInstanceOf(SubscriptionOrCreditsRequiredError);
    expect(mockAtomicToggle).not.toHaveBeenCalled();
  });

  it("stops at ARTICLE_NOT_FOUND before any access or mutation", async () => {
    mockArticleExists.mockResolvedValueOnce(false);
    await expect(
      toggleArticleLikeWithMonetizedAccess(
        {
          userId: "user-1",
          articleId: "deleted-article",
          platform: "ANDROID",
        },
        ports,
      ),
    ).rejects.toThrow("ARTICLE_NOT_FOUND");
    expect(mockResolveArticleEntitlement).not.toHaveBeenCalled();
    expect(mockAtomicToggle).not.toHaveBeenCalled();
  });

  it("does not count legacy purchased access as a subscription", async () => {
    mockArticleExists.mockResolvedValue(true);
    await expect(
      toggleArticleLikeWithMonetizedAccess(
        {
          userId: "user-1",
          articleId: "article-1",
          platform: "ANDROID",
        },
        ports,
      ),
    ).rejects.toBeInstanceOf(SubscriptionOrCreditsRequiredError);
  });

  it("permits a like for a subscriber", async () => {
    mockArticleExists.mockResolvedValue(true);
    mockResolveArticleEntitlement.mockResolvedValue({ allowed: true, source: "SUBSCRIPTION" });
    await expect(
      toggleArticleLikeWithMonetizedAccess(
        {
          userId: "user-1",
          articleId: "article-1",
          platform: "WEB_DESKTOP",
        },
        ports,
      ),
    ).resolves.toBe(true);
    expect(mockAtomicToggle).toHaveBeenCalledWith("user-1", "article-1");
  });

  it("permits a rewarded article unlock", async () => {
    mockArticleExists.mockResolvedValue(true);
    mockResolveArticleEntitlement.mockResolvedValue({ allowed: true, source: "REWARDED" });
    await expect(
      toggleArticleLikeWithMonetizedAccess(
        {
          userId: "user-1",
          articleId: "article-1",
          platform: "IOS",
        },
        ports,
      ),
    ).resolves.toBe(true);
    expect(mockResolveArticleEntitlement).toHaveBeenCalledWith("article-1", "user-1", "IOS");
  });
});
