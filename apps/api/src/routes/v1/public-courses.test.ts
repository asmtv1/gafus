import { beforeEach, describe, expect, it, vi } from "vitest";

// This fixture exercises the ACTUAL Core anonymous whitelist projection, not
// legacy getCoursesWithProgress. Only the Prisma read repository is stubbed.
const courseFindManyMock = vi.hoisted(() => vi.fn());
vi.mock("@gafus/prisma", () => ({ prisma: { course: { findMany: courseFindManyMock } } }));
vi.mock("@gafus/core/services/course", async () => ({
  getPublicCoursesCatalog: (
    await import("../../../../../packages/core/src/services/course/publicCatalogService")
  ).getPublicCoursesCatalog,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));

import { publicCoursesRoutes } from "./public-courses";


const publicCourse = {
  id: "public-1",
  name: "Общий курс",
  type: "general",
  shortDesc: "Базовый курс",
  duration: "7 дней",
  isPrivate: false,
  isPaid: true,
  hasAccess: true,
  trainingLevel: "BEGINNER",
  userStatus: "IN_PROGRESS",
  isFavorite: true,
  dayLinks: [{ id: "secret", day: { title: "Not public lesson" } }],
  userCourses: [{ userId: "sensitive-user" }],
  favoritedBy: [{ userId: "sensitive-fan" }],
  reviews: [{ user: { username: "sensitive-reviewer" } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("GET /api/v1/public/courses anonymous catalog", () => {
  it("strips private course and every per-user field", async () => {
    const sourceRows = [
      publicCourse,
      { ...publicCourse, id: "private-1", isPrivate: true, name: "Hidden course" },
    ];
    courseFindManyMock.mockImplementation(async (args: { where: { isPrivate: boolean } }) =>
      sourceRows.filter((row) => row.isPrivate === args.where.isPrivate),
    );
    const response = await publicCoursesRoutes.request("/");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(courseFindManyMock).toHaveBeenCalledExactlyOnceWith({
      where: { isPrivate: false },
      select: {
        id: true,
        name: true,
        type: true,
        shortDesc: true,
        logoImg: true,
        duration: true,
        isPaid: true,
        trainingLevel: true,
      },
    });
    const payload = (await response.json()) as {
      success: boolean;
      data: Record<string, unknown>[];
    };
    expect(payload.success).toBe(true);
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]).toEqual({
      id: "public-1",
      name: "Общий курс",
      type: "general",
      shortDesc: "Базовый курс",
      duration: "7 дней",
      isPaid: true,
      isPrivate: false,
      hasAccess: false,
      isFavorite: false,
      userStatus: "NOT_STARTED",
      trainingLevel: "BEGINNER",
    });
    const encoded = JSON.stringify(payload);
    for (const secret of [
      "Hidden course",
      "secret",
      "sensitive-user",
      "sensitive-fan",
      "sensitive-reviewer",
      "IN_PROGRESS",
    ])
      expect(encoded).not.toContain(secret);
  });

  it("exposes only vetted public card cover artwork, never signed CDN query params", async () => {
    const safeCover =
      "https://storage.yandexcloud.net/gafus-media/uploads/courses/public-cover.webp";
    const legacyBlob =
      "https://storage.yandexcloud.net/gafus-media/uploads/trainers/trainer123/courses/0478ee02-df96-4f9d-8e30-e050e002faf5/0478ee02-df96-4f9d-8e30-e050e002faf5.blob";
    courseFindManyMock.mockResolvedValueOnce([
      { ...publicCourse, logoImg: safeCover },
      { ...publicCourse, id: "signed-cover", logoImg: `${safeCover}?token=leakmarker` },
      { ...publicCourse, id: "foreign-cover", logoImg: "https://example.com/private.png" },
      { ...publicCourse, id: "legacy-course-cover", logoImg: legacyBlob },
    ]);
    const response = await publicCoursesRoutes.request("/");
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      data: Record<string, unknown>[];
    };
    expect(payload.success).toBe(true);
    expect(payload.data).toHaveLength(4);
    expect(payload.data[0]?.logoImg).toBe(safeCover);
    expect(payload.data[1]).not.toHaveProperty("logoImg");
    expect(payload.data[2]).not.toHaveProperty("logoImg");
    expect(payload.data[3]?.logoImg).toBe(legacyBlob);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("leakmarker");
    expect(serialized).not.toContain("example.com");
    expect(serialized).not.toContain("sensitive-user");
    expect(serialized).not.toContain("sensitive-fan");
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("returns no-store on service failure", async () => {
    courseFindManyMock.mockRejectedValue(new Error("test-only-db-failure"));
    const response = await publicCoursesRoutes.request("/");
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body).not.toContain("test-only-db-failure");
  });

  it("standalone old projection is isolated; not an authenticated Web consumer", async () => {
    courseFindManyMock.mockResolvedValue([publicCourse]);
    const response = await publicCoursesRoutes.request("/");
    expect(response.status).toBe(200);
    const envelope = await response.json() as { data: unknown[] };
    expect(envelope.data).toMatchObject([{
      id: "public-1", hasAccess: false, isFavorite: false,
    }]);
  });
});
