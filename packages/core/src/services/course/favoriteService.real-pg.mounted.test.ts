/** COURSE030: actual favorite write Core → Prisma → private production-shaped PG18. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  addFavoriteCourse,
  getFavoritesCourses,
  removeFavoriteCourse,
  toggleFavoriteCourse,
} from "./favoriteService";
import { createWriteFavoriteApplication } from "../../../../../apps/api/src/modules/courses/application/write-favorite";

// The only gated non-target dependency: do not load/call subscription/finance policy.
const guardedEntitlement = vi.hoisted(() =>
  vi.fn(async () => ({ allowed: false, source: "DENIED" })),
);
vi.mock("../contentAccess/policy", () => ({ resolveCourseEntitlement: guardedEntitlement }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

const dbName = "gafus_refactor_favorites_ag1_20261024";
const dataRoot =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_course030_favorite_20261024";
const key = "ag1course030realpg_20261024_";
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
  expect(process.env.G1_AG1_FAVORITE_OWN_PG18).toBe("1");
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
async function listA() {
  return prisma.favoriteCourse.findMany({
    where: { userId: x.a },
    select: { courseId: true },
    orderBy: { courseId: "asc" },
  });
}
async function assertOwnerRows(expectedA: string[], expectedB: string[]) {
  expect((await listA()).map((r) => r.courseId)).toEqual([...expectedA].sort());
  expect(
    (
      await prisma.favoriteCourse.findMany({ where: { userId: x.b }, select: { courseId: true } })
    ).map((r) => r.courseId),
  ).toEqual(expectedB);
  expect(await prisma.favoriteCourse.count({ where: { userId: x.c } })).toBe(0);
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
  await prisma.favoriteCourse.create({ data: { userId: x.b, courseId: x.public } });
}, 45000);

beforeEach(async () => {
  await verifyIdentity();
  // These are only our own fixture keys in this entirely dedicated DB.
  await prisma.favoriteCourse.deleteMany({ where: { userId: x.a, courseId: { in: courseIds } } });
}, 30000);

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

describe("COURSE030 real Prisma Favorites on original archive PostgreSQL18", () => {
  it("A add twice is one row and does not mutate B or unassigned course", async () => {
    await addFavoriteCourse(x.a, x.public);
    await addFavoriteCourse(x.a, x.public);
    await addFavoriteCourse(x.a, x.private);
    await addFavoriteCourse(x.a, x.unassigned);
    await assertOwnerRows([x.public, x.private, x.unassigned], [x.public]);
    expect(await prisma.favoriteCourse.count({ where: { userId: x.a, courseId: x.public } })).toBe(
      1,
    );
    expect(await prisma.favoriteCourse.count()).toBe(4);
  });
  it("A remove twice is stable and never removes B favorite", async () => {
    await addFavoriteCourse(x.a, x.public);
    await removeFavoriteCourse(x.a, x.public);
    await removeFavoriteCourse(x.a, x.public);
    await assertOwnerRows([], [x.public]);
    expect(await prisma.favoriteCourse.count()).toBe(1);
  });
  it("toggle on/off returns the actual saved boolean and row state, without altering B", async () => {
    expect(await toggleFavoriteCourse(x.a, x.public)).toBe(true);
    await assertOwnerRows([x.public], [x.public]);
    expect(await toggleFavoriteCourse(x.a, x.public)).toBe(false);
    await assertOwnerRows([], [x.public]);
  });
  it("accepted POST application delegates actual Core add, remove, toggle, FK persisted", async () => {
    const app = createWriteFavoriteApplication({
      add: addFavoriteCourse,
      remove: removeFavoriteCourse,
      toggle: toggleFavoriteCourse,
    });
    expect(await app.execute({ actorUserId: x.a, courseId: x.public, action: "add" })).toBe(true);
    expect(await app.execute({ actorUserId: x.a, courseId: x.public, action: "add" })).toBe(true);
    expect(await app.execute({ actorUserId: x.a, courseId: x.private, action: "toggle" })).toBe(
      true,
    );
    await assertOwnerRows([x.public, x.private], [x.public]);
    expect(await app.execute({ actorUserId: x.a, courseId: x.private, action: "toggle" })).toBe(
      false,
    );
    expect(await app.execute({ actorUserId: x.a, courseId: x.public, action: "remove" })).toBe(
      false,
    );
    expect(await app.execute({ actorUserId: x.a, courseId: x.public, action: "remove" })).toBe(
      false,
    );
    await assertOwnerRows([], [x.public]);
  });
  it("real GET returns only visible public and assigned private courses with progress and sanitized projection", async () => {
    await addFavoriteCourse(x.a, x.public);
    await addFavoriteCourse(x.a, x.private);
    await addFavoriteCourse(x.a, x.unassigned);
    const result = await getFavoritesCourses(x.a);
    // The original policy keeps favoriteIds even when a private course is not returned in data.
    expect(new Set(result.favoriteIds)).toEqual(new Set([x.public, x.private, x.unassigned]));
    expect(new Set(result.data.map((c) => c.id))).toEqual(new Set([x.public, x.private]));
    expect(result.data.find((c) => c.id === x.unassigned)).toBeUndefined();
    const publicCourse = result.data.find((c) => c.id === x.public);
    expect(publicCourse).toBeDefined();
    expect(publicCourse).toMatchObject({
      name: "Fictional public",
      type: "ag1_favorite_public",
      isFavorite: true,
      isPrivate: false,
      isPaid: false,
      hasAccess: true,
      userStatus: "IN_PROGRESS",
      startedAt,
      completedAt: null,
      startedUsersCount: 2,
      authorUsername: x.author,
      authorAvatarUrl: null,
      userCourses: [],
      dayLinks: [],
    });
    expect(publicCourse?.createdAt).toBeInstanceOf(Date);
    expect(publicCourse?.updatedAt).toBeInstanceOf(Date);
    expect(publicCourse?.reviews).toEqual([
      {
        rating: 4,
        comment: "Fictional feedback",
        createdAt: expect.any(Date),
        user: { username: "", profile: null },
      },
    ]);
    expect(Object.keys(publicCourse ?? {})).not.toContain("guideContent");
    expect(Object.keys(publicCourse ?? {})).not.toContain("version");
    const assigned = result.data.find((c) => c.id === x.private);
    expect(assigned).toMatchObject({
      isPrivate: true,
      isPaid: false,
      hasAccess: true,
      userStatus: "NOT_STARTED",
      startedAt: null,
      completedAt: null,
      startedUsersCount: 0,
      dayLinks: [],
      userCourses: [],
      isFavorite: true,
    });
    expect(guardedEntitlement).toHaveBeenCalledWith(
      { id: "", isPrivate: false, isPaid: true },
      x.a,
    );
    const bResult = await getFavoritesCourses(x.b);
    expect(bResult.favoriteIds).toEqual([x.public]);
    expect(bResult.data).toHaveLength(1);
    expect(bResult.data[0]).toMatchObject({
      id: x.public,
      userStatus: "COMPLETED",
      completedAt: startedAt,
      hasAccess: true,
      startedUsersCount: 2,
    });
    expect(await prisma.favoriteCourse.count({ where: { userId: x.a } })).toBe(3);
    expect(await prisma.userCourse.count({ where: { userId: x.a, courseId: x.public } })).toBe(1);
    expect(await prisma.courseAccess.count({ where: { courseId: x.private, userId: x.a } })).toBe(
      1,
    );
  });
  it("unassigned C without favorites returns empty [] while entitlement external port is stubbed", async () => {
    const result = await getFavoritesCourses(x.c);
    expect(result).toEqual({ data: [], favoriteIds: [] });
    expect(guardedEntitlement).toHaveBeenCalled();
  });
});
