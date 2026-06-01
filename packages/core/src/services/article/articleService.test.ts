import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  createArticle,
  deleteArticle,
  getArticleBySlug,
  getArticleBySlugForMonetizedAccess,
  getArticleForEdit,
  getArticles,
  incrementArticleView,
  unlockArticleBySlug,
  updateArticle,
} from "./articleService";
import { SubscriptionOrCreditsRequiredError } from "../rewardedCredits";

const mockArticleFindMany = vi.fn();
const mockArticleFindUnique = vi.fn();
const mockArticleCreate = vi.fn();
const mockArticleUpdate = vi.fn();
const mockArticleDelete = vi.fn();
const mockArticleUpdateMany = vi.fn();
const mockTransaction = vi.fn();
const mockArticleViewerCreate = vi.fn();
const mockArticleViewerCreateMany = vi.fn();
const mockArticleViewerUpdate = vi.fn();
const mockArticleGuestViewCreate = vi.fn();
const mockArticleGuestViewCreateMany = vi.fn();
const mockGetPremiumOrRewardedAccess = vi.fn();
const mockUnlockRewardedTarget = vi.fn();

vi.mock("@gafus/prisma", () => ({
  isPrismaUniqueConstraintError: (error: unknown) =>
    Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "P2002",
    ),
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    article: {
      findMany: (...args: unknown[]) => mockArticleFindMany(...args),
      findUnique: (...args: unknown[]) => mockArticleFindUnique(...args),
      create: (...args: unknown[]) => mockArticleCreate(...args),
      update: (...args: unknown[]) => mockArticleUpdate(...args),
      delete: (...args: unknown[]) => mockArticleDelete(...args),
      updateMany: (...args: unknown[]) => mockArticleUpdateMany(...args),
    },
    articleViewer: {
      create: (...args: unknown[]) => mockArticleViewerCreate(...args),
      createMany: (...args: unknown[]) => mockArticleViewerCreateMany(...args),
      update: (...args: unknown[]) => mockArticleViewerUpdate(...args),
    },
    articleGuestView: {
      create: (...args: unknown[]) => mockArticleGuestViewCreate(...args),
      createMany: (...args: unknown[]) => mockArticleGuestViewCreateMany(...args),
    },
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("../rewardedCredits", () => ({
  getPremiumOrRewardedAccess: (...args: unknown[]) => mockGetPremiumOrRewardedAccess(...args),
  unlockRewardedTarget: (...args: unknown[]) => mockUnlockRewardedTarget(...args),
  REWARDED_ARTICLE_COST: 1,
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {
    code = "SUBSCRIPTION_OR_CREDITS_REQUIRED" as const;
  },
}));

function listRow(overrides: Record<string, unknown> = {}) {
  const createdAt = new Date("2024-01-01T00:00:00.000Z");
  const updatedAt = new Date("2024-01-02T00:00:00.000Z");
  return {
    id: "a1",
    title: "Заголовок",
    slug: "slug-one",
    authorId: "auth1",
    contentType: "HTML",
    visibility: "PUBLIC",
    priceRub: null,
    videoUrl: null,
    logoImg: "",
    imageUrls: [],
    viewCount: 0,
    description: "Описание",
    createdAt,
    updatedAt,
    author: { username: "author", profile: { avatarUrl: null as string | null } },
    _count: { articleLikes: 2 },
    articleLikes: [] as { userId: string }[],
    access: [] as { userId: string }[],
    ...overrides,
  };
}

describe("getArticles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("возвращает список DTO", async () => {
    mockArticleFindMany.mockResolvedValue([listRow()]);

    const r = await getArticles(undefined, 10, 0);

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toHaveLength(1);
      expect(r.data[0].slug).toBe("slug-one");
      expect(r.data[0].hasAccess).toBe(false);
    }
  });

  it("фильтр по автору передаётся в where", async () => {
    mockArticleFindMany.mockResolvedValue([]);

    await getArticles(undefined, 50, 0, "auth1");

    expect(mockArticleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { authorId: "auth1" },
      }),
    );
  });

  it("ошибка при сбое Prisma", async () => {
    mockArticleFindMany.mockRejectedValue(new Error("db"));

    const r = await getArticles();

    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("Не удалось");
    }
  });
});

describe("getArticleBySlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("статья не найдена", async () => {
    mockArticleFindUnique.mockResolvedValue(null);

    const r = await getArticleBySlug("missing");

    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("не найдена");
    }
  });

  it("PUBLIC: контент не раскрывается без monetized access", async () => {
    mockArticleFindUnique.mockResolvedValue({
      ...listRow(),
      content: "<p>HTML</p>",
    });

    const r = await getArticleBySlug("slug-one");

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.hasAccess).toBe(false);
      expect(r.data.content).toBeNull();
    }
  });

  it("PAID без доступа: content null", async () => {
    mockArticleFindUnique.mockResolvedValue({
      ...listRow({ visibility: "PAID", priceRub: 100 }),
      content: "<p>Секрет</p>",
      articleLikes: [],
      access: [],
    });

    const r = await getArticleBySlug("paid-slug");

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.hasAccess).toBe(false);
      expect(r.data.content).toBeNull();
    }
  });
});

describe("getArticleBySlugForMonetizedAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PUBLIC без Premium/rewarded access: не раскрывает content", async () => {
    mockArticleFindUnique.mockResolvedValue({
      ...listRow({ visibility: "PUBLIC", priceRub: null }),
      content: "<p>Открытый текст тоже за paywall</p>",
      articleLikes: [],
      access: [],
    });
    mockGetPremiumOrRewardedAccess.mockRejectedValue(new SubscriptionOrCreditsRequiredError());

    const r = await getArticleBySlugForMonetizedAccess({
      slug: "public-slug",
      userId: "user-1",
      platform: "WEB_DESKTOP",
    });

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.content).toBeNull();
      expect(r.data.hasAccess).toBe(false);
      expect(r.data.monetization).toMatchObject({
        locked: true,
        target: { targetType: "ARTICLE", targetId: "a1", cost: 1 },
      });
    }
    expect(mockGetPremiumOrRewardedAccess).toHaveBeenCalled();
  });

  it("PAID без Premium/rewarded access: не раскрывает content и не списывает", async () => {
    mockArticleFindUnique.mockResolvedValue({
      ...listRow({ visibility: "PAID", priceRub: 100 }),
      content: "<p>Секрет</p>",
      articleLikes: [],
      access: [],
    });
    mockGetPremiumOrRewardedAccess.mockRejectedValue(new SubscriptionOrCreditsRequiredError());

    const r = await getArticleBySlugForMonetizedAccess({
      slug: "paid-slug",
      userId: "user-1",
      platform: "WEB_DESKTOP",
    });

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.content).toBeNull();
      expect(r.data.monetization).toMatchObject({
        locked: true,
        target: { targetType: "ARTICLE", targetId: "a1", cost: 1 },
      });
    }
    expect(mockGetPremiumOrRewardedAccess).toHaveBeenCalled();
  });

  it("PAID с Premium/rewarded access: раскрывает content", async () => {
    mockArticleFindUnique.mockResolvedValue({
      ...listRow({ visibility: "PAID", priceRub: 100 }),
      content: "<p>Секрет</p>",
      articleLikes: [],
      access: [],
    });
    mockGetPremiumOrRewardedAccess.mockResolvedValue({ allowed: true, source: "PREMIUM" });

    const r = await getArticleBySlugForMonetizedAccess({
      slug: "paid-slug",
      userId: "user-1",
      platform: "WEB_DESKTOP",
    });

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.content).toBe("<p>Секрет</p>");
      expect(r.data.monetization?.locked).toBe(false);
    }
  });

  it("PAID с существующим ArticleAccess раскрывает content без Premium/rewarded проверки", async () => {
    mockArticleFindUnique.mockResolvedValue({
      ...listRow({ visibility: "PAID", priceRub: 100 }),
      content: "<p>Купленный доступ</p>",
      articleLikes: [],
      access: [{ userId: "user-1" }],
    });

    const r = await getArticleBySlugForMonetizedAccess({
      slug: "paid-slug",
      userId: "user-1",
      platform: "WEB_DESKTOP",
    });

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.content).toBe("<p>Купленный доступ</p>");
      expect(r.data.hasAccess).toBe(true);
      expect(r.data.monetization?.locked).toBe(false);
    }
    expect(mockGetPremiumOrRewardedAccess).not.toHaveBeenCalled();
  });
});

describe("unlockArticleBySlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("spends rewarded credits for a public article because all articles are behind paywall", async () => {
    mockArticleFindUnique.mockResolvedValue({
      id: "a1",
      visibility: "PUBLIC",
      access: [],
    });
    mockUnlockRewardedTarget.mockResolvedValue({
      targetType: "ARTICLE",
      targetId: "a1",
      unlocked: true,
      spentCredits: 1,
      balance: 4,
      pendingRefundCredits: 0,
    });

    const result = await unlockArticleBySlug({
      slug: "public-slug",
      userId: "user-1",
      platform: "WEB_DESKTOP",
    });

    expect(result).toEqual({
      success: true,
      data: {
        targetType: "ARTICLE",
        targetId: "a1",
        unlocked: true,
        spentCredits: 1,
        balance: 4,
        pendingRefundCredits: 0,
      },
    });
    expect(mockUnlockRewardedTarget).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "WEB_DESKTOP",
      target: { targetType: "ARTICLE", targetId: "a1", cost: 1 },
    });
  });
});

const validCreateInput = {
  title: "Заголовок",
  content: "<p>Текст</p>",
  slug: "my-article-slug",
  visibility: "PUBLIC" as const,
  contentType: "HTML" as const,
  logoImg: "",
  imageUrls: [] as string[],
  description: "",
};

describe("createArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockArticleCreate.mockResolvedValue({ id: "new-id", slug: "my-article-slug" });
  });

  it("ошибка валидации Zod", async () => {
    const r = await createArticle({ title: "" }, "u1");

    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.length).toBeGreaterThan(0);
    }
    expect(mockArticleCreate).not.toHaveBeenCalled();
  });

  it("успех: create и возврат id/slug", async () => {
    const r = await createArticle(validCreateInput, "author-1");

    expect(r.success).toBe(true);
    if (r.success && r.data) {
      expect(r.data.id).toBe("new-id");
      expect(r.data.slug).toBe("my-article-slug");
    }
    expect(mockArticleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorId: "author-1",
          slug: "my-article-slug",
        }),
      }),
    );
  });

  it("ошибка при сбое Prisma", async () => {
    mockArticleCreate.mockRejectedValue(new Error("db"));

    const r = await createArticle(validCreateInput, "u1");

    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("создать");
    }
  });
});

describe("updateArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockArticleUpdate.mockResolvedValue({});
  });

  it("статья не найдена", async () => {
    mockArticleFindUnique.mockResolvedValue(null);

    const r = await updateArticle("a1", { title: "N" }, "u1");

    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("не найдена");
    }
  });

  it("чужой автор", async () => {
    mockArticleFindUnique.mockResolvedValue({ authorId: "other" });

    const r = await updateArticle("a1", { title: "N" }, "u1");

    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("прав");
    }
  });

  it("ошибка валидации частичного update", async () => {
    mockArticleFindUnique.mockResolvedValue({ authorId: "u1" });

    const r = await updateArticle("a1", { slug: "НЕ_ЛАТИНИЦА" }, "u1");

    expect(r.success).toBe(false);
    expect(mockArticleUpdate).not.toHaveBeenCalled();
  });

  it("успешное обновление", async () => {
    mockArticleFindUnique.mockResolvedValue({ authorId: "u1" });

    const r = await updateArticle("a1", { title: "Новый заголовок" }, "u1");

    expect(r.success).toBe(true);
    expect(mockArticleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "a1" },
        data: { title: "Новый заголовок" },
      }),
    );
  });
});

describe("getArticleForEdit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("нет прав", async () => {
    mockArticleFindUnique.mockResolvedValue({
      title: "T",
      contentType: "HTML",
      content: "c",
      visibility: "PUBLIC",
      priceRub: null,
      videoUrl: null,
      logoImg: "",
      imageUrls: [],
      slug: "s",
      authorId: "other",
      description: "",
    });

    const r = await getArticleForEdit("a1", "u1");

    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("прав");
    }
  });

  it("успех", async () => {
    mockArticleFindUnique.mockResolvedValue({
      title: "T",
      contentType: "HTML",
      content: "c",
      visibility: "PUBLIC",
      priceRub: null,
      videoUrl: null,
      logoImg: "",
      imageUrls: [],
      slug: "s",
      authorId: "u1",
      description: "d",
    });

    const r = await getArticleForEdit("a1", "u1");

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.slug).toBe("s");
    }
  });
});

describe("incrementArticleView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockArticleFindUnique.mockResolvedValue({ id: "art1" });
    mockArticleUpdate.mockResolvedValue({});
    mockArticleViewerCreate.mockResolvedValue({});
    mockArticleViewerCreateMany.mockResolvedValue({ count: 1 });
    mockArticleViewerUpdate.mockResolvedValue({});
    mockArticleGuestViewCreate.mockResolvedValue({});
    mockArticleGuestViewCreateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation(
      async (
        fn: (tx: {
          article: { update: typeof mockArticleUpdate };
          articleViewer: {
            create: typeof mockArticleViewerCreate;
            createMany: typeof mockArticleViewerCreateMany;
            update: typeof mockArticleViewerUpdate;
          };
          articleGuestView: {
            create: typeof mockArticleGuestViewCreate;
            createMany: typeof mockArticleGuestViewCreateMany;
          };
        }) => Promise<void>,
      ) => {
        await fn({
          article: { update: mockArticleUpdate },
          articleViewer: {
            create: mockArticleViewerCreate,
            createMany: mockArticleViewerCreateMany,
            update: mockArticleViewerUpdate,
          },
          articleGuestView: {
            create: mockArticleGuestViewCreate,
            createMany: mockArticleGuestViewCreateMany,
          },
        });
      },
    );
  });

  it("гость без ключа — счётчик не меняется", async () => {
    await expect(incrementArticleView("slug-x")).resolves.toEqual({ success: true });
    expect(mockTransaction).toHaveBeenCalled();
    expect(mockArticleUpdate).not.toHaveBeenCalled();
    expect(mockArticleGuestViewCreate).not.toHaveBeenCalled();
    expect(mockArticleViewerCreate).not.toHaveBeenCalled();
  });

  it("гость с ключом — первая запись + инкремент", async () => {
    await expect(
      incrementArticleView("slug-x", { guestVisitorKey: "abcd1234abcd1234" }),
    ).resolves.toEqual({ success: true });
    expect(mockArticleGuestViewCreateMany).toHaveBeenCalledWith({
      data: { articleId: "art1", visitorKey: "abcd1234abcd1234" },
      skipDuplicates: true,
    });
    expect(mockArticleGuestViewCreate).not.toHaveBeenCalled();
    expect(mockArticleUpdate).toHaveBeenCalledWith({
      where: { id: "art1" },
      data: { viewCount: { increment: 1 } },
    });
  });

  it("гость с ключом повторно — createMany count 0, без инкремента", async () => {
    mockArticleGuestViewCreateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      incrementArticleView("slug-x", { guestVisitorKey: "abcd1234abcd1234" }),
    ).resolves.toEqual({ success: true });
    expect(mockArticleUpdate).not.toHaveBeenCalled();
    expect(mockArticleGuestViewCreate).not.toHaveBeenCalled();
  });

  it("авторизованный первый просмотр — create зрителя и инкремент", async () => {
    await incrementArticleView("slug-x", { viewerUserId: "user-1" });
    expect(mockArticleViewerCreateMany).toHaveBeenCalledWith({
      data: { articleId: "art1", userId: "user-1" },
      skipDuplicates: true,
    });
    expect(mockArticleViewerCreate).not.toHaveBeenCalled();
    expect(mockArticleUpdate).toHaveBeenCalledWith({
      where: { id: "art1" },
      data: { viewCount: { increment: 1 } },
    });
    expect(mockArticleViewerUpdate).not.toHaveBeenCalled();
  });

  it("авторизованный повторный просмотр — createMany count 0 и только lastViewedAt", async () => {
    mockArticleViewerCreateMany.mockResolvedValueOnce({ count: 0 });
    await incrementArticleView("slug-x", { viewerUserId: "user-1" });
    expect(mockArticleViewerUpdate).toHaveBeenCalledWith({
      where: { articleId_userId: { articleId: "art1", userId: "user-1" } },
      data: { lastViewedAt: expect.any(Date) as Date },
    });
    expect(mockArticleUpdate).not.toHaveBeenCalled();
    expect(mockArticleViewerCreate).not.toHaveBeenCalled();
  });

  it("slug не найден — без транзакции", async () => {
    mockArticleFindUnique.mockResolvedValueOnce(null);
    await expect(incrementArticleView("missing")).resolves.toEqual({ success: true });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("ошибка БД", async () => {
    mockTransaction.mockRejectedValue(new Error("db"));

    const r = await incrementArticleView("s");

    expect(r.success).toBe(false);
    expect(r.error).toContain("просмотр");
  });
});

describe("deleteArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockArticleDelete.mockResolvedValue({});
  });

  it("не найдена", async () => {
    mockArticleFindUnique.mockResolvedValue(null);

    const r = await deleteArticle("a1", "u1");

    expect(r.success).toBe(false);
    expect(mockArticleDelete).not.toHaveBeenCalled();
  });

  it("успех", async () => {
    mockArticleFindUnique.mockResolvedValue({ authorId: "u1" });

    const r = await deleteArticle("a1", "u1");

    expect(r.success).toBe(true);
    expect(r.trainerId).toBe("u1");
    expect(mockArticleDelete).toHaveBeenCalledWith({ where: { id: "a1" } });
  });
});
