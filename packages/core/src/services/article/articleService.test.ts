import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  createArticle,
  deleteArticle,
  getArticleBySlug,
  getArticleForEdit,
  getArticles,
  incrementArticleView,
  updateArticle,
} from "./articleService";

const mockArticleFindMany = vi.fn();
const mockArticleFindUnique = vi.fn();
const mockArticleCreate = vi.fn();
const mockArticleUpdate = vi.fn();
const mockArticleDelete = vi.fn();
const mockArticleUpdateMany = vi.fn();
const mockTransaction = vi.fn();
const mockArticleViewerUpsert = vi.fn();

vi.mock("@gafus/prisma", () => ({
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
      upsert: (...args: unknown[]) => mockArticleViewerUpsert(...args),
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

function listRow(overrides: Record<string, unknown> = {}) {
  const createdAt = new Date("2024-01-01T00:00:00.000Z");
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
      expect(r.data[0].hasAccess).toBe(true);
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

  it("PUBLIC: контент доступен без userId", async () => {
    mockArticleFindUnique.mockResolvedValue({
      ...listRow(),
      content: "<p>HTML</p>",
    });

    const r = await getArticleBySlug("slug-one");

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.content).toBe("<p>HTML</p>");
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

    const r = await updateArticle(
      "a1",
      { slug: "НЕ_ЛАТИНИЦА" },
      "u1",
    );

    expect(r.success).toBe(false);
    expect(mockArticleUpdate).not.toHaveBeenCalled();
  });

  it("успешное обновление", async () => {
    mockArticleFindUnique.mockResolvedValue({ authorId: "u1" });

    const r = await updateArticle(
      "a1",
      { title: "Новый заголовок" },
      "u1",
    );

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
    mockArticleViewerUpsert.mockResolvedValue({});
    mockTransaction.mockImplementation(
      async (
        fn: (tx: {
          article: { update: typeof mockArticleUpdate };
          articleViewer: { upsert: typeof mockArticleViewerUpsert };
        }) => Promise<void>
      ) => {
        await fn({
          article: { update: mockArticleUpdate },
          articleViewer: { upsert: mockArticleViewerUpsert },
        });
      }
    );
  });

  it("успех без пользователя — только счётчик", async () => {
    await expect(incrementArticleView("slug-x")).resolves.toEqual({ success: true });
    expect(mockArticleFindUnique).toHaveBeenCalledWith({
      where: { slug: "slug-x" },
      select: { id: true },
    });
    expect(mockTransaction).toHaveBeenCalled();
    expect(mockArticleUpdate).toHaveBeenCalledWith({
      where: { id: "art1" },
      data: { viewCount: { increment: 1 } },
    });
    expect(mockArticleViewerUpsert).not.toHaveBeenCalled();
  });

  it("успех с пользователем — upsert зрителя", async () => {
    await incrementArticleView("slug-x", "user-1");
    expect(mockArticleViewerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { articleId_userId: { articleId: "art1", userId: "user-1" } },
        create: { articleId: "art1", userId: "user-1" },
        update: { lastViewedAt: expect.any(Date) as Date },
      })
    );
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
