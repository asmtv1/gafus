import { beforeEach, describe, expect, it, vi } from "vitest";

import { SubscriptionOrCreditsRequiredError } from "../rewardedCredits";

const mockArticleFindUnique = vi.fn();
const mockArticleLikeFindUnique = vi.fn();
const mockArticleLikeCreate = vi.fn();
const mockArticleLikeDelete = vi.fn();
const mockGetPremiumOrRewardedAccess = vi.fn();

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
  getPremiumOrRewardedAccess: (...args: unknown[]) => mockGetPremiumOrRewardedAccess(...args),
  REWARDED_ARTICLE_COST: 1,
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {
    code = "SUBSCRIPTION_OR_CREDITS_REQUIRED" as const;
  },
}));

import { toggleArticleLikeWithMonetizedAccess } from "./articleLikeService";

describe("toggleArticleLikeWithMonetizedAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockArticleLikeFindUnique.mockResolvedValue(null);
    mockArticleLikeCreate.mockResolvedValue({});
    mockArticleLikeDelete.mockResolvedValue({});
  });

  it("does not toggle a locked article without Premium, rewarded unlock, or ArticleAccess", async () => {
    mockArticleFindUnique.mockResolvedValue({ id: "article-1", visibility: "PUBLIC", access: [] });
    mockGetPremiumOrRewardedAccess.mockRejectedValue(new SubscriptionOrCreditsRequiredError());

    await expect(
      toggleArticleLikeWithMonetizedAccess({
        userId: "user-1",
        articleId: "article-1",
        platform: "WEB_DESKTOP",
      }),
    ).rejects.toBeInstanceOf(SubscriptionOrCreditsRequiredError);

    expect(mockArticleLikeCreate).not.toHaveBeenCalled();
    expect(mockArticleLikeDelete).not.toHaveBeenCalled();
  });

  it("toggles an article with existing ArticleAccess without Premium/rewarded lookup", async () => {
    mockArticleFindUnique.mockResolvedValue({
      id: "article-1",
      visibility: "PAID",
      access: [{ userId: "user-1" }],
    });

    await expect(
      toggleArticleLikeWithMonetizedAccess({
        userId: "user-1",
        articleId: "article-1",
        platform: "ANDROID",
      }),
    ).resolves.toBe(true);

    expect(mockGetPremiumOrRewardedAccess).not.toHaveBeenCalled();
    expect(mockArticleLikeCreate).toHaveBeenCalledWith({
      data: { userId: "user-1", articleId: "article-1" },
    });
  });

  it("toggles a public article with Premium access by article id", async () => {
    mockArticleFindUnique.mockResolvedValue({ id: "article-1", visibility: "PUBLIC", access: [] });
    mockGetPremiumOrRewardedAccess.mockResolvedValue({
      allowed: true,
      source: "PREMIUM",
      skippedDueToPremium: true,
      target: { targetType: "ARTICLE", targetId: "article-1" },
    });

    await expect(
      toggleArticleLikeWithMonetizedAccess({
        userId: "user-1",
        articleId: "article-1",
        platform: "WEB_DESKTOP",
      }),
    ).resolves.toBe(true);

    expect(mockGetPremiumOrRewardedAccess).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "WEB_DESKTOP",
      target: { targetType: "ARTICLE", targetId: "article-1" },
    });
    expect(mockArticleLikeCreate).toHaveBeenCalledWith({
      data: { userId: "user-1", articleId: "article-1" },
    });
  });

  it("does not let Premium or rewarded access bypass a PAID article purchase", async () => {
    mockArticleFindUnique.mockResolvedValue({ id: "article-1", visibility: "PAID", access: [] });

    await expect(
      toggleArticleLikeWithMonetizedAccess({
        userId: "user-1",
        articleId: "article-1",
        platform: "ANDROID",
      }),
    ).rejects.toBeInstanceOf(SubscriptionOrCreditsRequiredError);
    expect(mockGetPremiumOrRewardedAccess).not.toHaveBeenCalled();
    expect(mockArticleLikeCreate).not.toHaveBeenCalled();
  });
});
