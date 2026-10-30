import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getArticles: vi.fn(),
  getArticleBySlugForMonetizedAccess: vi.fn(),
  getUserPets: vi.fn(),
  getPetById: vi.fn(),
}));
vi.mock("@gafus/core/services/article", () => ({
  getArticles: mocks.getArticles,
  getArticleBySlugForMonetizedAccess: mocks.getArticleBySlugForMonetizedAccess,
}));
vi.mock("@gafus/core/services/pets", () => ({
  getUserPets: mocks.getUserPets,
  getPetById: mocks.getPetById,
}));
// Pet list/detail routes now enter the dedicated Core petRead read composition.
vi.mock("@gafus/core/services/petRead", () => ({
  getUserPets: mocks.getUserPets,
  getPetById: mocks.getPetById,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));

import { petsRoutes } from "./pets";
import { articlesRoutes } from "./articles";
import { listMyPets, getMyPet } from "../../../../../apps/web-vite/src/features/pets/petApi";
import {
  listMyArticles,
  getMyArticle,
} from "../../../../../apps/web-vite/src/features/articles/articleApi";

const user = { id: "user-1", username: "trainer", role: "USER" } as const;

function app() {
  const hono = new Hono();
  hono.use("/api/v1/pets/*", async (c, next) => {
    c.set("user", user);
    await next();
  });
  hono.use("/api/v1/articles/*", async (c, next) => {
    c.set("user", user);
    await next();
  });
  hono.route("/api/v1/pets", petsRoutes);
  hono.route("/api/v1/articles", articlesRoutes);
  return hono;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Hono authenticated list endpoints reused by Vite", () => {
  it("pets GET remains compatible with Mobile, without browser caching", async () => {
    mocks.getUserPets.mockResolvedValue([
      {
        id: "pet-1",
        name: "Бим",
        type: "DOG",
        breed: "Метис",
        showInProfile: false,
        ownerId: "user-1",
        notes: "Private veterinary record",
        weightKg: 12.3,
        awards: [{ id: "private-award" }],
      },
    ]);
    const response = await app().request("/api/v1/pets");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getUserPets).toHaveBeenCalledWith("user-1", {
      throwOnError: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) => app().request(path)),
    );
    const result = await listMyPets();
    expect(result).toEqual([
      {
        id: "pet-1",
        name: "Бим",
        type: "DOG",
        breed: "Метис",
        showInProfile: false,
        weightKg: 12.3,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("Private veterinary record");
    expect(JSON.stringify(result)).not.toContain("private-award");
  });

  it("pet detail checks ownership in Core, never HTTP-caches sensitive fields", async () => {
    const pet = {
      id: "pet123",
      name: "Луна",
      type: "CAT",
      breed: "Метис",
      showInProfile: false,
      notes: "Приватная запись",
      birthDate: "2020-01-01T00:00:00.000Z",
      weightKg: 4,
      heightCm: null,
      ownerId: "user-1",
      awards: [{ private: "award" }],
    };
    mocks.getPetById.mockResolvedValue(pet);
    const response = await app().request("/api/v1/pets/pet123");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getPetById).toHaveBeenCalledWith("pet123", user.id);
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) => app().request(path)),
    );
    expect(await getMyPet("pet123")).toEqual({
      id: pet.id,
      name: pet.name,
      type: pet.type,
      breed: pet.breed,
      showInProfile: pet.showInProfile,
      notes: pet.notes,
      birthDate: pet.birthDate,
      weightKg: 4,
      heightCm: null,
      neckGirthCm: null,
      muzzleGirthCm: null,
      bellyGirthCm: null,
    });
  });

  it("pet detail never falls back to another owner's record", async () => {
    mocks.getPetById.mockResolvedValue(null);
    const response = await app().request("/api/v1/pets/other-owner-pet");
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) => app().request(path)),
    );
    await expect(getMyPet("other-owner-pet")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("pet DB exception returns private no-store 500", async () => {
    mocks.getPetById.mockRejectedValue(new Error("isolated-db-failure"));
    const response = await app().request("/api/v1/pets/pet123");
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("articles GET uses existing monetized Core and strips paid media in Vite", async () => {
    mocks.getArticles.mockResolvedValue({
      success: true,
      data: [
        {
          id: "article-1",
          title: "Вопросы",
          slug: "questions",
          description: "Описание",
          visibility: "PAID",
          hasAccess: false,
          authorUsername: "trainer",
          likeCount: 10,
          content: "Secret content",
          videoUrl: "private-video.mp4",
          imageUrls: ["secret.jpg"],
          authorId: "person-private",
        },
      ],
    });
    const response = await app().request("/api/v1/articles");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getArticles).toHaveBeenCalledWith(user.id);
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) => app().request(path)),
    );
    const result = await listMyArticles();
    expect(result).toEqual([
      {
        id: "article-1",
        title: "Вопросы",
        slug: "questions",
        description: "Описание",
        visibility: "PAID",
        hasAccess: false,
        authorUsername: "trainer",
        likeCount: 10,
      },
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Secret content");
    expect(serialized).not.toContain("private-video");
    expect(serialized).not.toContain("person-private");
  });

  it("Hono uses WEB_DESKTOP for cookie users even when platform query spoofs Android", async () => {
    mocks.getArticleBySlugForMonetizedAccess.mockResolvedValue({
      success: true,
      data: {
        id: "article-1",
        title: "Статья",
        content: null,
        hasAccess: false,
        monetization: { locked: true },
      },
    });
    const request = await app().request("/api/v1/articles/example?platform=ANDROID", {
      headers: { Cookie: "gafus_access=test-access-cookie" },
    });
    expect(request.status).toBe(200);
    expect(request.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getArticleBySlugForMonetizedAccess).toHaveBeenCalledWith({
      slug: "example",
      userId: user.id,
      platform: "WEB_DESKTOP",
    });
    const body = await request.json();
    expect(body).toMatchObject({
      success: true,
      data: { hasAccess: false, content: null },
    });
  });

  it("Vite article detail consumes Hono paywall response, not historical grants", async () => {
    const safeDetail = {
      id: "article-1",
      slug: "obedience",
      title: "Обучение",
      description: "Содержание доступно по подписке",
      visibility: "PAID",
      hasAccess: false,
      likeCount: 2,
      authorUsername: "trainer",
      contentType: "HTML",
      content: null,
      videoUrl: "secret.mp4",
      imageUrls: ["hidden.png"],
    };
    mocks.getArticleBySlugForMonetizedAccess.mockResolvedValue({
      success: true,
      data: safeDetail,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) =>
        app().request(path, {
          headers: { Cookie: "gafus_access=test-cookie" },
        }),
      ),
    );
    const response = await getMyArticle("obedience");
    expect(mocks.getArticleBySlugForMonetizedAccess).toHaveBeenCalledWith({
      slug: "obedience",
      userId: user.id,
      platform: "WEB_DESKTOP",
    });
    expect(response).toEqual({
      id: safeDetail.id,
      slug: safeDetail.slug,
      title: safeDetail.title,
      description: safeDetail.description,
      visibility: safeDetail.visibility,
      hasAccess: false,
      likeCount: 2,
      authorUsername: "trainer",
      contentType: "HTML",
      content: null,
      createdAt: null,
      imageUrls: [],
      videoUrl: null,
      isLiked: false,
    });
    expect(JSON.stringify(response)).not.toContain("secret.mp4");
    expect(JSON.stringify(response)).not.toContain("hidden.png");
  });

  it("article detail maps Core storage failures to 500, not a permanent 404", async () => {
    mocks.getArticleBySlugForMonetizedAccess.mockResolvedValue({
      success: false,
      error: "Не удалось загрузить статью",
    });
    const response = await app().request("/api/v1/articles/failing");
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) => app().request(path)),
    );
    await expect(getMyArticle("failing")).rejects.toMatchObject({ status: 500 });
  });

  it("article detail exceptions return private no-store 500", async () => {
    mocks.getArticleBySlugForMonetizedAccess.mockRejectedValue(
      new Error("isolated-entitlement-error"),
    );
    const response = await app().request("/api/v1/articles/secret");
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("missing article is still a 404 without browser caching", async () => {
    mocks.getArticleBySlugForMonetizedAccess.mockResolvedValue({
      success: false,
      error: "Статья не найдена",
    });
    const response = await app().request("/api/v1/articles/missing");
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("Hono retains Android and iOS request-platform contracts for Bearer clients", async () => {
    mocks.getArticleBySlugForMonetizedAccess.mockResolvedValue({
      success: true,
      data: { id: "article-1", title: "Article", content: null },
    });
    const android = await app().request("/api/v1/articles/entry", {
      headers: { Authorization: "Bearer mobile-jwt" },
    });
    expect(android.status).toBe(200);
    expect(mocks.getArticleBySlugForMonetizedAccess).toHaveBeenLastCalledWith({
      slug: "entry",
      userId: user.id,
      platform: "ANDROID",
    });
    const ios = await app().request("/api/v1/articles/entry?platform=IOS", {
      headers: { Authorization: "Bearer mobile-jwt" },
    });
    expect(ios.status).toBe(200);
    expect(mocks.getArticleBySlugForMonetizedAccess).toHaveBeenLastCalledWith({
      slug: "entry",
      userId: user.id,
      platform: "IOS",
    });
  });

  it("server-side errors fail closed rather than showing empty lists", async () => {
    mocks.getUserPets.mockRejectedValue(new Error("test db unavailable"));
    const response = await app().request("/api/v1/pets");
    expect(response.status).toBe(500);
    mocks.getArticles.mockResolvedValue({ success: false, error: "Не удалось загрузить статьи" });
    const articlesResponse = await app().request("/api/v1/articles");
    expect(articlesResponse.status).toBe(500);
    expect(articlesResponse.headers.get("cache-control")).toBe("no-store");
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) => app().request(path)),
    );
    await expect(listMyArticles()).rejects.toMatchObject({ status: 500 });
  });
});
