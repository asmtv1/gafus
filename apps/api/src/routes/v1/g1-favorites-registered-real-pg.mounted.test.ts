/** COURSE030/G3: registered Favorites GET → actual application/original Core → real owned PG18 → JSON. */
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";

// Accepted real-Core SQL fixture previously excluded live finance entitlement policy.
// Preserve that non-target gate: deterministic DENIED for a synthetic paid policy probe.
// This IS called by original favorite Core on every GET; it is NOT a real premium test.
const premiumDenied = vi.hoisted(() => vi.fn(async () => ({ allowed: false, source: "DENIED" })));
// Original courseService's logo mutation imports a version writer that must NOT execute on GET.
const forbiddenWrite = vi.hoisted(() =>
  vi.fn(() => {
    throw Error("COURSE_FAVORITES_GET_UNRELATED_VERSION_WRITE_FORBIDDEN");
  }),
);
vi.mock("../../../../../packages/core/src/services/contentAccess/policy", () => ({
  resolveCourseEntitlement: premiumDenied,
}));
vi.mock("../../../../../packages/core/src/services/trainerCourse/courseVersionService", () => ({
  setCourseLogoVersioned: forbiddenWrite,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));
// Real API Vitest-alias @gafus/core/services/course SOURCE exports, no mocks for these or Prisma.
import { coursesRoutes } from "./courses";

const dbName = "gafus_refactor_favorites_registered_ag1_20261024";
const dataRoot =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_course030_favorite_hono_sql_20261024";
const key = "ag1favorites_hono_pg18_20261024_";
const id = (suffix: string) => key + suffix;
const x = {
  author: id("author"),
  a: id("student_a"),
  b: id("student_b"),
  c: id("student_c"),
  public: id("course_public"),
  private: id("course_private"),
  unassigned: id("course_private_unassigned"),
  day: id("day"),
  dayLink: id("day_link"),
  review: id("review"),
  authorProfile: id("profile"),
};
const actorIds = [x.author, x.a, x.b, x.c];
const courseIds = [x.public, x.private, x.unassigned];
const startedAt = new Date("2031-02-03T09:00:00.000Z");
let seeded = false;

async function verifyIdentity() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_FAVORITES_HONO_OWN_PG18).toBe("1");
  expect([
    u.protocol,
    u.hostname,
    u.port,
    u.pathname,
    u.searchParams.get("host"),
    u.searchParams.get("application_name"),
    u.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${dbName}`, socket, appTag, ""]);
  const rows = await prisma.$queryRaw<
    {
      db: boolean;
      version: boolean;
      dataDir: boolean;
      noTcp: boolean;
      sock: boolean;
      outsiders: bigint;
    }[]
  >`
    SELECT current_database()=${dbName} AS db,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${dataRoot} AS "dataDir",
      current_setting('listen_addresses')='' AS "noTcp",
      current_setting('unix_socket_directories')=${socket} AS sock,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
        AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${dbName}
          OR application_name IS DISTINCT FROM ${appTag})) AS outsiders
  `;
  expect(rows).toEqual([
    { db: true, version: true, dataDir: true, noTcp: true, sock: true, outsiders: 0n },
  ]);
}
beforeAll(async () => {
  await verifyIdentity();
  const counts = await prisma.$queryRaw<
    { users: bigint; courses: bigint; favorites: bigint; ledger: bigint; version: bigint }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS users,
      (SELECT count(*) FROM public."Course") AS courses,
      (SELECT count(*) FROM public."FavoriteCourse") AS favorites,
      (SELECT count(*) FROM public._prisma_migrations) AS ledger,
      (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
        AND table_name='Course' AND column_name='version') AS version
  `;
  expect(counts).toEqual([{ users: 0n, courses: 0n, favorites: 0n, ledger: 0n, version: 0n }]);
  await prisma.user.createMany({
    data: actorIds.map((id) => ({ id, username: id, password: "fictional-only" })),
  });
  seeded = true;
  await prisma.userProfile.create({
    data: { id: x.authorProfile, userId: x.author, avatarUrl: null },
  });
  for (const [courseId, kind] of [
    [x.public, "public"],
    [x.private, "private"],
    [x.unassigned, "unassigned"],
  ] as const) {
    // Fixture ONLY: production-shaped original SQL columns. No Course.version in archive.
    await prisma.$executeRaw`
      INSERT INTO public."Course"
        ("id","name","type","trainingLevel","duration","logoImg", "isPrivate", "isPaid",
          "authorId","updatedAt")
      VALUES (${courseId}, ${`Fictional ${kind}`}, ${`ag1_favorite_${kind}`},'BEGINNER'::"TrainingLevel",
        '10 min','fixture-not-media', ${kind !== "public"}, false, ${x.author}, CURRENT_TIMESTAMP)
    `;
  }
  await prisma.courseAccess.create({ data: { courseId: x.private, userId: x.a } });
  await prisma.userCourse.createMany({
    data: [
      { userId: x.a, courseId: x.public, status: "IN_PROGRESS", startedAt },
      { userId: x.b, courseId: x.public, status: "COMPLETED", completedAt: startedAt },
    ],
  });
  await prisma.courseReview.create({
    data: {
      id: x.review,
      userId: x.b,
      courseId: x.public,
      rating: 4,
      comment: "Fictional feedback",
    },
  });
  await prisma.trainingDay.create({
    data: { id: x.day, authorId: x.author, title: "Fictional day", updatedAt: startedAt },
  });
  await prisma.dayOnCourse.create({
    data: { id: x.dayLink, courseId: x.public, dayId: x.day, order: 0 },
  });
  // Both principals' favorite links are seeded as source records, never via API POST/PUT/DELETE.
  await prisma.favoriteCourse.createMany({
    data: [
      { userId: x.a, courseId: x.public },
      { userId: x.a, courseId: x.private },
      { userId: x.a, courseId: x.unassigned },
      { userId: x.b, courseId: x.public },
    ],
  });
}, 45000);

afterAll(async () => {
  try {
    await verifyIdentity();
    if (seeded) {
      await prisma.favoriteCourse.deleteMany({
        where: { userId: { in: actorIds }, courseId: { in: courseIds } },
      });
      await prisma.dayOnCourse.deleteMany({ where: { id: x.dayLink } });
      await prisma.trainingDay.deleteMany({ where: { id: x.day } });
      await prisma.courseReview.deleteMany({ where: { id: x.review } });
      await prisma.userCourse.deleteMany({
        where: { userId: { in: actorIds }, courseId: { in: courseIds } },
      });
      await prisma.courseAccess.deleteMany({ where: { courseId: x.private, userId: x.a } });
      await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
      await prisma.userProfile.deleteMany({ where: { id: x.authorProfile } });
      await prisma.user.deleteMany({ where: { id: { in: actorIds } } });
    }
    const totals = await prisma.$queryRaw<
      {
        users: bigint;
        courses: bigint;
        favorites: bigint;
        reviews: bigint;
        days: bigint;
        ledger: bigint;
      }[]
    >`
      SELECT (SELECT count(*) FROM public."User") AS users,
        (SELECT count(*) FROM public."Course") AS courses,
        (SELECT count(*) FROM public."FavoriteCourse") AS favorites,
        (SELECT count(*) FROM public."CourseReview") AS reviews,
        (SELECT count(*) FROM public."TrainingDay") AS days,
        (SELECT count(*) FROM public._prisma_migrations) AS ledger
    `;
    expect(totals).toEqual([
      { users: 0n, courses: 0n, favorites: 0n, reviews: 0n, days: 0n, ledger: 0n },
    ]);
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

const app = new Hono();
app.use("/api/v1/courses/*", async (c, next) => {
  // Synthetic test principal only; no auth middleware, JWT or real HTTP socket.
  c.set("user", {
    id: c.req.header("x-own-test-user") ?? x.a,
    role: "USER",
    username: "fictional-owned-actor",
  });
  await next();
});
app.route("/api/v1/courses", coursesRoutes);
const get = (actor = x.a) =>
  app.request("/api/v1/courses/favorites", {
    headers: { "x-own-test-user": actor },
  });
const exact = (row: Record<string, unknown>, keys: string[]) =>
  expect(Object.keys(row).sort()).toEqual([...keys].sort());
const courseKeys = [
  "id",
  "name",
  "type",
  "description",
  "shortDesc",
  "duration",
  "logoImg",
  "isPrivate",
  "isPaid",
  "hasAccess",
  "avgRating",
  "trainingLevel",
  "createdAt",
  "updatedAt",
  "authorUsername",
  "authorAvatarUrl",
  "userStatus",
  "startedAt",
  "completedAt",
  "startedUsersCount",
  "isFavorite",
  "reviews",
  "userCourses",
  "dayLinks",
];
const expectPrivacy = (r: Response) =>
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");

describe("COURSE030 original registered GET favorites Hono+packaged Core real SQL JSON", () => {
  it("A: real owner favorites IDs include hidden private, projected public+assigned private only", async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expectPrivacy(r);
    const body = await r.json();
    exact(body, ["success", "data"]);
    expect(body.success).toBe(true);
    exact(body.data, ["favoriteIds", "data"]);
    expect(new Set(body.data.favoriteIds)).toEqual(new Set([x.public, x.private, x.unassigned]));
    expect(new Set(body.data.data.map((c: { id: string }) => c.id))).toEqual(
      new Set([x.public, x.private]),
    );
    expect(body.data.data.find((c: { id: string }) => c.id === x.unassigned)).toBeUndefined();
    for (const c of body.data.data) {
      exact(c, courseKeys);
      expect(c.isFavorite).toBe(true);
      expect(c.createdAt).toMatch(/^20[0-9]{2}-[0-9]{2}-[0-9]{2}T/);
      expect(c.updatedAt).toMatch(/^20[0-9]{2}-[0-9]{2}-[0-9]{2}T/);
      expect(c.authorUsername).toBe(x.author);
      expect(c.authorAvatarUrl).toBeNull();
      expect(c.userCourses).toEqual([]);
      expect(c.dayLinks).toEqual([]);
      expect(Object.keys(c)).not.toContain("version");
      expect(Object.keys(c)).not.toContain("guideContent");
    }
    const pub = body.data.data.find((c: { id: string }) => c.id === x.public);
    const privateCourse = body.data.data.find((c: { id: string }) => c.id === x.private);
    expect(pub).toMatchObject({
      name: "Fictional public",
      isPrivate: false,
      isPaid: false,
      hasAccess: true,
      isFavorite: true,
      userStatus: "IN_PROGRESS",
      startedAt: startedAt.toISOString(),
      completedAt: null,
      startedUsersCount: 2,
    });
    expect(privateCourse).toMatchObject({
      isPrivate: true,
      isPaid: false,
      hasAccess: true,
      userStatus: "NOT_STARTED",
      startedAt: null,
      completedAt: null,
      startedUsersCount: 0,
    });
    expect(premiumDenied).toHaveBeenCalledWith({ id: "", isPrivate: false, isPaid: true }, x.a);
  });
  it("B is isolated; C empty is the real JSON envelope, no invented status or favorites", async () => {
    const b = await get(x.b);
    expect(b.status).toBe(200);
    expectPrivacy(b);
    const bJson = await b.json();
    exact(bJson, ["success", "data"]);
    expect(bJson.data.favoriteIds).toEqual([x.public]);
    expect(bJson.data.data).toHaveLength(1);
    expect(bJson.data.data[0]).toMatchObject({
      id: x.public,
      userStatus: "COMPLETED",
      completedAt: startedAt.toISOString(),
      startedUsersCount: 2,
      isFavorite: true,
      hasAccess: true,
    });
    expect(JSON.stringify(bJson)).not.toContain(x.unassigned);
    const empty = await get(x.c);
    expect(empty.status).toBe(200);
    expectPrivacy(empty);
    expect(await empty.json()).toEqual({ success: true, data: { data: [], favoriteIds: [] } });
  });
  it("nested reviews exact safe fields/dates, source rows unchanged, unused mutation zero", async () => {
    const r = await get(x.a);
    expect(r.status).toBe(200);
    expectPrivacy(r);
    const body = await r.json();
    const pub = body.data.data.find((c: { id: string }) => c.id === x.public);
    expect(pub.reviews).toHaveLength(1);
    exact(pub.reviews[0], ["rating", "comment", "createdAt", "user"]);
    expect(pub.reviews[0]).toMatchObject({
      rating: 4,
      comment: "Fictional feedback",
      user: { username: "", profile: null },
    });
    exact(pub.reviews[0].user, ["username", "profile"]);
    expect(pub.reviews[0].createdAt).toMatch(/^20[0-9]{2}-[0-9]{2}-[0-9]{2}T/);
    expect(await prisma.favoriteCourse.count()).toBe(4);
    expect(await prisma.courseReview.count()).toBe(1);
    expect(await prisma.courseAccess.count()).toBe(1);
    expect(await prisma.userCourse.count()).toBe(2);
    expect(forbiddenWrite).not.toHaveBeenCalled();
    expect(premiumDenied).toHaveBeenCalled();
  });
});
