import { beforeEach, describe, expect, it, vi } from "vitest";

import { SubscriptionOrCreditsRequiredError } from "../rewardedCredits";

const mockArticleFindUnique = vi.fn();
const mockArticleLikeFindUnique = vi.fn();
const mockArticleLikeCreate = vi.fn();
const mockArticleLikeDelete = vi.fn();
const mockResolveArticleEntitlement = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    article: {
      findUnique: (...args: unknown[]) => mockArticleFindUnique(...args),
    },
    articleLike: {
      findUnique: (...args: unknown[]) => mockArticleLikeFindUnique(...args),
      create: (...args: unknown[]) => mockArticleLikeCreate(...args),
      delete: (...args: unknown[]) => mockArticleLikeDelete(...args),
    },
  },
}));

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
    mockArticleLikeFindUnique.mockResolvedValue(null);
    mockArticleLikeCreate.mockResolvedValue({});
  });

  it("rejects a like without an active subscription", async () => {
    mockArticleFindUnique.mockResolvedValue({ id: "article-1" });
    await expect(toggleArticleLikeWithMonetizedAccess({
      userId: "user-1", articleId: "article-1", platform: "WEB_DESKTOP",
    })).rejects.toBeInstanceOf(SubscriptionOrCreditsRequiredError);
    expect(mockArticleLikeCreate).not.toHaveBeenCalled();
  });

  it("does not count legacy purchased access as a subscription", async () => {
    mockArticleFindUnique.mockResolvedValue({
      id: "article-1", access: [{ userId: "user-1" }],
    });
    await expect(toggleArticleLikeWithMonetizedAccess({
      userId: "user-1", articleId: "article-1", platform: "ANDROID",
    })).rejects.toBeInstanceOf(SubscriptionOrCreditsRequiredError);
  });

  it("permits a like for a subscriber", async () => {
    mockArticleFindUnique.mockResolvedValue({ id: "article-1" });
    mockResolveArticleEntitlement.mockResolvedValue({ allowed: true, source: "SUBSCRIPTION" });
    await expect(toggleArticleLikeWithMonetizedAccess({
      userId: "user-1", articleId: "article-1", platform: "WEB_DESKTOP",
    })).resolves.toBe(true);
    expect(mockArticleLikeCreate).toHaveBeenCalledWith({
      data: { userId: "user-1", articleId: "article-1" },
    });
  });

  it("permits a rewarded article unlock", async () => {
    mockArticleFindUnique.mockResolvedValue({ id: "article-1" });
    mockResolveArticleEntitlement.mockResolvedValue({ allowed: true, source: "REWARDED" });
    await expect(toggleArticleLikeWithMonetizedAccess({
      userId: "user-1", articleId: "article-1", platform: "IOS",
    })).resolves.toBe(true);
    expect(mockResolveArticleEntitlement).toHaveBeenCalledWith("article-1", "user-1", "IOS");
  });
});
