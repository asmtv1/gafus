import { afterEach, describe, expect, it, vi } from "vitest";
import { listMyArticles, getMyArticle, registerMyArticleView, safeArticleCover } from "./articleApi";
import { apiRequest } from "../../shared/api/client";

afterEach(() => vi.unstubAllGlobals());
const raw = {
  id: "article-1", slug: "article", title: "Воспитание",
  description: "Описание", visibility: "PAID",
  hasAccess: false, likeCount: 12, authorUsername: "trainer",
  content: "Private text", videoUrl: "private-content.mp4",
  imageUrls: ["private-image.png"], authorId: "private-author",
};

describe("Vite articles browser DTO projection", () => {
  it("rejects a path-breaking identifier before any card tries to link it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: [{ ...raw, slug: "../secret" }],
    }), { status: 200 })));
    await expect(listMyArticles()).rejects.toThrow("некорректный список");
  });

  it("only retains article teasers and never caches paid content", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: [raw],
    }), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    const result = await listMyArticles();
    expect(result).toEqual([{
      id: "article-1", slug: "article", title: "Воспитание",
      description: "Описание", visibility: "PAID",
      hasAccess: false, likeCount: 12, authorUsername: "trainer",
    }]);
    expect(JSON.stringify(result)).not.toContain("Private text");
    expect(JSON.stringify(result)).not.toContain("private-content");
    expect(mock.mock.calls[0][0]).toBe("/api/v1/articles");
  });

  it("rejects invalid paywall access flags instead of guessing access", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: [{ ...raw, hasAccess: "true" }],
    }), { status: 200 })));
    await expect(listMyArticles()).rejects.toThrow("некорректный список");
  });
});


describe("ARTICLE_CYRILLIC_CANONICAL_API_PATH", () => {
  it("GET of Cyrillic slug uses exactly canonical encoded same-origin relative article path", async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      success: true, data: {
        id: "article-1", slug: "учебный", title: "Курс",
        description: "Описание", visibility: "PUBLIC", hasAccess: true,
        likeCount: 0, authorUsername: "trainer", contentType: "TEXT",
        content: "Обучение собаки", secretMedia: "NEVER_EXPOSE",
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    const result = await getMyArticle("учебный");
    expect(result.content).toBe("Обучение собаки");
    expect(result).not.toHaveProperty("secretMedia");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe("/api/v1/articles/%D1%83%D1%87%D0%B5%D0%B1%D0%BD%D1%8B%D0%B9");
    expect(spy.mock.calls[0][1]).toMatchObject({method:"GET",credentials:"include",cache:"no-store"});
  });
  it("POST /view encodes Cyrillic slug exactly and never submits private caller identifiers", async () => {
    const spy = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({success:true}),{status:200},
    ));
    vi.stubGlobal("fetch",spy);
    await registerMyArticleView("учебный");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toBe(
      "/api/v1/articles/" + encodeURIComponent("учебный") + "/view");
    expect(spy.mock.calls[0][1]).toMatchObject({
      method:"POST",credentials:"include",cache:"no-store",body:"{}",
      headers: {"X-Gafus-Auth-Transport":"cookie","Content-Type":"application/json"},
    });
  });
  it("the Cyrillic /view route rejects escaping and forged subresources", async () => {
    const spy = vi.fn();vi.stubGlobal("fetch",spy);
    for(const invalid of [
      "/api/v1/articles/%2Fadmin/view", "/api/v1/articles/%2E%2E/view",
      "/api/v1/articles/%252Fsecret/view", "/api/v1/articles/%GG/view",
      "/api/v1/articles/"+encodeURIComponent("учебный")+"/view/extra",
      "https://evil.example/api/v1/articles/%D1%83/view",
    ]) await expect(apiRequest(invalid,{method:"POST"})).rejects.toThrow("Only relative");
    await expect(registerMyArticleView("../admin")).rejects.toThrow("адрес статьи");
    expect(spy).not.toHaveBeenCalled();
  });
  it("encoded slash/dot/backslash/URL spoof never reaches fetch", async () => {
    const spy = vi.fn(); vi.stubGlobal("fetch", spy);
    for (const path of [
      "https://evil.example/api/v1/articles/%D1%83", "//evil.example/api/v1/articles/%D1%83",
      "/api/v1/articles/%2Fadmin", "/api/v1/articles/%5csecret",
      "/api/v1/articles/%2e%2e", "/api/v1/articles/%252Fadmin",
      "/api/v1/articles/%GG", "/api/v1/articles/%D1%ZZ",
      "/api/v1/articles/%41", "/api/v1/articles/%D1%83/other",
      "/api/v1/articles/%D1%83?private=true", "/api/v1/admin/%D1%83",
    ]) await expect(apiRequest(path)).rejects.toThrow("Only relative /api/v1");
    expect(spy).not.toHaveBeenCalled();
  });
});


describe("NEXT_ARTICLE_PUBLIC_COVER", () => {
  it("allows only a public article cover in the canonical existing CDN namespace", async () => {
    const valid = "uploads/trainers/trainer1/articles/article1/cover.webp";
    expect(safeArticleCover(valid)).toBe(
      "https://storage.yandexcloud.net/gafus-media/"+valid,
    );
    expect(safeArticleCover("https://storage.yandexcloud.net/gafus-media/"+valid))
      .toBe("https://storage.yandexcloud.net/gafus-media/"+valid);
    for(const broken of ["https://evil.example/logo.webp",
      "https://storage.yandexcloud.net/gafus-media/uploads/users/user1/private.jpg",
      "https://storage.yandexcloud.net/gafus-media/"+valid+"?sig=secret",
      "https://storage.yandexcloud.net/gafus-media/"+valid+"/../secret.jpg",
      "javascript:alert(1)", "//evil.example/a.jpg", "uploads/users/user1/photo.jpg",
      "uploads/trainers/trainer1/articles/article1/%2e%2e/secret.jpg",
    ])expect(safeArticleCover(broken)).toBeNull();
  });
  it("uses the first Core-published article image when logoImg is empty, like Next", async () => {
    const path = "uploads/trainers/trainer1/articles/article1/first.webp";
    const first = "https://storage.yandexcloud.net/gafus-media/" + path;
    const privateLater = "uploads/trainers/trainer1/articles/article1/private-gallery.webp";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: [{ ...raw, logoImg: "", imageUrls: [path, privateLater],
        content: "DO_NOT_EXPOSE_FULL_BODY" }],
    }), { status: 200 })));
    const [card] = await listMyArticles();
    expect(card.logoImg).toBe(first);
    expect(card).not.toHaveProperty("imageUrls");
    expect(JSON.stringify(card)).not.toContain("private-gallery");
    expect(JSON.stringify(card)).not.toContain("DO_NOT_EXPOSE_FULL_BODY");
  });
  it("prefers a valid logoImg over gallery and rejects external cover URLs", async () => {
    const prefix = "https://storage.yandexcloud.net/gafus-media/";
    const logo = prefix + "uploads/trainers/trainer1/articles/article1/logo.png";
    const teaser = "uploads/trainers/trainer1/articles/article1/teaser.webp";
    const malicious = "https://example.evil/paid-content.png";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: [
        { ...raw, id: "article-a", slug: "one", logoImg: logo, imageUrls: [teaser] },
        { ...raw, id: "article-b", slug: "two", logoImg: malicious,
          imageUrls: [teaser] },
        { ...raw, id: "article-c", slug: "three", logoImg: malicious,
          imageUrls: [malicious] },
      ],
    }), { status: 200 })));
    const cards = await listMyArticles();
    expect(cards[0].logoImg).toBe(logo);
    expect(cards[1].logoImg).toBe(prefix + teaser);
    expect(cards[2]).not.toHaveProperty("logoImg");
  });
  it("projects real public covers without copying paid image/video arrays", async () => {
    const url="https://storage.yandexcloud.net/gafus-media/uploads/trainers/trainer1/articles/article1/cover.webp";
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success:true,data:[{...raw,logoImg:url,viewCount:29,isLiked:true}],
    }),{status:200})));
    const [article]=await listMyArticles();
    expect(article.logoImg).toBe(url);
    expect(article.viewCount).toBe(29);
    expect(article.isLiked).toBe(true);
    expect(JSON.stringify(article)).not.toContain("private-image.png");
    expect(JSON.stringify(article)).not.toContain("private-content.mp4");
  });
});
