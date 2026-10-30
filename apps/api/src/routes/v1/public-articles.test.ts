import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { publicArticlesRoutes } from "./public-articles";
import {
  getArticles, getArticleBySlugForMonetizedAccess, incrementArticleView,
} from "@gafus/core/services/article";

vi.mock("@gafus/core/services/article", () => ({
  getArticles: vi.fn(),
  getArticleBySlugForMonetizedAccess: vi.fn(),
  incrementArticleView: vi.fn(),
}));
const list = vi.mocked(getArticles);
const detail = vi.mocked(getArticleBySlugForMonetizedAccess);
const view = vi.mocked(incrementArticleView);
const app = new Hono().route("/api/v1/public/articles", publicArticlesRoutes);
const row = {
  id: "article-a", slug: "dog-training", title: "Собака", visibility: "PAID" as const,
  description: "Краткое описание", hasAccess: true, likeCount: 3,
  authorUsername: "trainer", viewCount: 9, logoImg: "cover.png",
  isLiked: true, authorId: "SECRET_AUTHOR", authorAvatarUrl: null,
  imageUrls: ["SECRET_IMAGE"], videoUrl: "SECRET_VIDEO", contentType: "TEXT" as const,
  content: "SECRET_PAID_ARTICLE", createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  list.mockResolvedValue({ success: true, data: [row] });
  detail.mockResolvedValue({ success: true, data: row });
  view.mockResolvedValue({ success: true });
});

describe("registered anonymous /public/articles contract", () => {
  it("catalog exposes only teasers and never guest entitlement or paid media", async () => {
    const response = await app.request("/api/v1/public/articles");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json() as { success: true; data: unknown[] };
    expect(body.success).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/SECRET_|authorId|videoUrl|imageUrls|content/);
    expect(body.data[0]).toMatchObject({ hasAccess: false, isLiked: false, title: "Собака" });
    expect(list).toHaveBeenCalledWith();
  });

  it("slug route withholds detail even if Core grants guest due to disabled gating", async () => {
    const response = await app.request("/api/v1/public/articles/dog-training");
    expect(response.status).toBe(200);
    const body = await response.json() as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ hasAccess: false, content: null,
      videoUrl: null, imageUrls: [], isLiked: false });
    expect(JSON.stringify(body)).not.toMatch(/SECRET_|authorId/);
    expect(detail).toHaveBeenCalledWith({ slug: "dog-training", platform: "WEB_DESKTOP" });
  });

  it("unknown slugs preserve real 404; invalid slugs cannot reach Core", async () => {
    detail.mockResolvedValueOnce({ success: false, error: "Статья не найдена" });
    expect((await app.request("/api/v1/public/articles/not-here")).status).toBe(404);
    expect((await app.request("/api/v1/public/articles/too.long")).status).toBe(400);
    expect(detail).toHaveBeenCalledTimes(1);
  });

  it("anonymous views require valid guest key and never accept userId", async () => {
    const invalid = await app.request("/api/v1/public/articles/dog-training/view", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorKey: "short", userId: "SPOOFED" }),
    });
    expect(invalid.status).toBe(400);
    expect(view).not.toHaveBeenCalled();
    const response = await app.request("/api/v1/public/articles/dog-training/view", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorKey: "01234567-abcde-5678", userId: "SPOOFED" }),
    });
    expect(response.status).toBe(200);
    expect(view).toHaveBeenCalledExactlyOnceWith("dog-training", {
      guestVisitorKey: "01234567-abcde-5678",
    });
  });
});
