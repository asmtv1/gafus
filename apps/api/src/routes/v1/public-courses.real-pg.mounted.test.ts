/** AG1/COURSE030 actual public Core+Prisma+isolated PostgreSQL18+Hono whitelist. */
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import type { PublicCourseCatalogItem } from "../../../../../packages/types/src/data/course";

// Isolate unrelated Core barrel imports, NOT the target original Core function:
// the real publicCatalogService and its original Prisma query execute unmocked.
vi.mock("@gafus/core/services/course", async () => ({
  getPublicCoursesCatalog: (
    await import("../../../../../packages/core/src/services/course/publicCatalogService")
  ).getPublicCoursesCatalog,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), success: vi.fn() }),
}));
import { getPublicCoursesCatalog } from "../../../../../packages/core/src/services/course/publicCatalogService";
import { publicCoursesRoutes } from "./public-courses";

const db = "gafus_refactor_publiccatalog_ag1_20261024";
const directory =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const sock = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const application = "ag1_course030_publiccatalog_20261024";
const id = (n: string) => `ag1_publiccatalog_20261024_${n}`;
const F = {
  author: id("author"),
  reviewer: id("reviewer"),
  profile: id("profile"),
  free: id("free"),
  paid: id("paid"),
  unprofiled: id("unprofiled"),
  private: id("private"),
  review: id("review"),
  day: id("day"),
  link: id("link"),
};
const courses = [F.free, F.paid, F.unprofiled, F.private];
const users = [F.author, F.reviewer];
const jsonKeys = [
  "id",
  "name",
  "type",
  "shortDesc",
  "duration",
  "isPaid",
  "isPrivate",
  "hasAccess",
  "isFavorite",
  "userStatus",
  "trainingLevel",
].sort();
const secrets = [
  "fictional-private-author-fullname",
  "fictional-secret-review-body",
  "fictional-hidden-guide-markup",
  "fictional-rich-description",
  "fictional-actor-username",
];
const app = new Hono().route("/api/v1/public/courses", publicCoursesRoutes);
const request = (path = "/api/v1/public/courses") => app.request(path);
let haveUsers = false;
let seeded = false;

async function verifyOwn() {
  expect(process.env.G1_AG1_PUBLIC_CATALOG_OWN_PG18).toBe("1");
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect([
    u.protocol,
    u.hostname,
    u.port,
    u.pathname,
    u.searchParams.get("host"),
    u.searchParams.get("application_name"),
    u.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${db}`, sock, application, ""]);
  const rows = await prisma.$queryRaw<
    {
      database: boolean;
      version: boolean;
      directory: boolean;
      unixOnly: boolean;
      socket: boolean;
      others: bigint;
    }[]
  >`
    SELECT current_database()=${db} AS database,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${directory} AS directory,
      current_setting('listen_addresses')='' AS "unixOnly",
      current_setting('unix_socket_directories')=${sock} AS socket,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
       AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${db}
         OR application_name IS DISTINCT FROM ${application})) AS others
  `;
  expect(rows).toEqual([
    {
      database: true,
      version: true,
      directory: true,
      unixOnly: true,
      socket: true,
      others: 0n,
    },
  ]);
}

beforeAll(async () => {
  await verifyOwn();
  const rows = await prisma.$queryRaw<
    { users: bigint; courses: bigint; reviews: bigint; ledger: bigint }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS users,
      (SELECT count(*) FROM public."Course") AS courses,
      (SELECT count(*) FROM public."CourseReview") AS reviews,
      (SELECT count(*) FROM public._prisma_migrations) AS ledger
  `;
  expect(rows).toEqual([{ users: 0n, courses: 0n, reviews: 0n, ledger: 0n }]);
}, 30000);

afterAll(async () => {
  try {
    await verifyOwn();
    if (seeded) {
      await prisma.courseReview.deleteMany({ where: { id: F.review } });
      await prisma.courseAccess.deleteMany({ where: { courseId: F.private, userId: F.reviewer } });
      await prisma.userCourse.deleteMany({ where: { courseId: F.free, userId: F.reviewer } });
      await prisma.dayOnCourse.deleteMany({ where: { id: F.link } });
      await prisma.trainingDay.deleteMany({ where: { id: F.day } });
      await prisma.$executeRaw`DELETE FROM public."Course" WHERE id IN (${F.free},${F.paid},${F.unprofiled},${F.private})`;
    }
    if (haveUsers) {
      await prisma.userProfile.deleteMany({ where: { id: F.profile } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    const counts = await prisma.$queryRaw<
      { users: bigint; courses: bigint; reviews: bigint; ledger: bigint }[]
    >`
      SELECT (SELECT count(*) FROM public."User") AS users,
        (SELECT count(*) FROM public."Course") AS courses,
        (SELECT count(*) FROM public."CourseReview") AS reviews,
        (SELECT count(*) FROM public._prisma_migrations) AS ledger
    `;
    expect(counts).toEqual([{ users: 0n, courses: 0n, reviews: 0n, ledger: 0n }]);
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

const expected = (course: {
  id: string;
  name: string;
  type: string;
  shortDesc: string;
  duration: string;
  isPaid: boolean;
  trainingLevel: PublicCourseCatalogItem["trainingLevel"];
}): PublicCourseCatalogItem => ({
  id: course.id,
  name: course.name,
  type: course.type,
  shortDesc: course.shortDesc,
  duration: course.duration,
  isPaid: course.isPaid,
  isPrivate: false,
  hasAccess: !course.isPaid,
  isFavorite: false,
  userStatus: "NOT_STARTED",
  trainingLevel: course.trainingLevel,
});

const rows: PublicCourseCatalogItem[] = [
  expected({
    id: F.free,
    name: "A fictional free course",
    type: "ag1_catalog_free",
    shortDesc: "",
    duration: "10 min",
    isPaid: false,
    trainingLevel: "BEGINNER",
  }),
  expected({
    id: F.paid,
    name: "B fictional paid course",
    type: "ag1_catalog_paid",
    shortDesc: "Paid description",
    duration: "45 min",
    isPaid: true,
    trainingLevel: "ADVANCED",
  }),
  expected({
    id: F.unprofiled,
    name: "C fictional public hidden-from-profile course",
    type: "ag1_catalog_unprofiled",
    shortDesc: "",
    duration: "15 min",
    isPaid: false,
    trainingLevel: "INTERMEDIATE",
  }),
];

async function insertFictionalCourses() {
  await verifyOwn();
  await prisma.user.createMany({
    data: users.map((user) => ({ id: user, username: user, password: "fictional-only" })),
  });
  haveUsers = true;
  await prisma.userProfile.create({
    data: { id: F.profile, userId: F.author, fullName: secrets[0], avatarUrl: null },
  });
  // Cleanup remains targeted even if a later fictional Course INSERT fails.
  seeded = true;
  for (const [idx, courseId] of courses.entries()) {
    const pub = idx !== 3;
    const item = rows[idx];
    const trainingLevel = item?.trainingLevel ?? "EXPERT";
    const isPaid = idx === 1;
    // Fixture ONLY on true existing archive columns; historical Course.version does not exist.
    await prisma.$executeRaw`
      INSERT INTO public."Course"("id","name","type","shortDesc","duration",
       "trainingLevel","logoImg","description","authorId","updatedAt",
       "isPrivate","isPaid","showInProfile","avgRating","videoUrl","guideContent")
      VALUES(${courseId},${item?.name ?? "Fictional private course"},
       ${item?.type ?? "ag1_catalog_private"},${item?.shortDesc ?? "private"},
       ${item?.duration ?? "25 min"},${trainingLevel}::"TrainingLevel",
       'fictional-opaque-media',${secrets[3]},${F.author},CURRENT_TIMESTAMP,
       ${!pub},${isPaid},${idx !== 2},${idx === 1 ? 4.25 : null},NULL,${secrets[2]})
    `;
  }
  await prisma.courseReview.create({
    data: { id: F.review, userId: F.reviewer, courseId: F.free, rating: null, comment: secrets[1] },
  });
  await prisma.courseAccess.create({ data: { courseId: F.private, userId: F.reviewer } });
  await prisma.userCourse.create({
    data: { courseId: F.free, userId: F.reviewer, status: "COMPLETED" },
  });
  await prisma.trainingDay.create({
    data: { id: F.day, authorId: F.author, title: "Fictional linked day" },
  });
  await prisma.dayOnCourse.create({
    data: { id: F.link, dayId: F.day, courseId: F.free, order: 0 },
  });
}

function assertPurePublic(data: PublicCourseCatalogItem[]) {
  expect(data).toHaveLength(3);
  expect(new Set(data.map((row) => row.id))).toEqual(new Set([F.free, F.paid, F.unprofiled]));
  for (const row of data) {
    expect(Object.keys(row).sort()).toEqual(jsonKeys);
    expect(row.isPrivate).toBe(false);
    expect(row.hasAccess).toBe(!row.isPaid);
    expect(row.isFavorite).toBe(false);
    expect(row.userStatus).toBe("NOT_STARTED");
  }
  const body = JSON.stringify(data);
  for (const secret of [
    ...secrets,
    F.private,
    F.author,
    F.reviewer,
    F.profile,
    F.review,
    F.link,
    F.day,
  ]) {
    expect(body).not.toContain(secret);
  }
  for (const key of [
    "reviews",
    "dayLinks",
    "userCourses",
    "author",
    "profile",
    "videoUrl",
    "guideContent",
    "description",
    "startedAt",
    "completedAt",
    "avgRating",
    "CourseAccess",
  ]) {
    expect(body).not.toContain(`"${key}"`);
  }
}

describe("COURSE030 original public catalog Core → real PG18 → registered Hono wire", () => {
  it("a genuinely empty original public Core query and Hono GET return [] with cache 60s", async () => {
    await verifyOwn();
    expect(await getPublicCoursesCatalog()).toEqual([]);
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(await response.json()).toEqual({ success: true, data: [] });
  });

  it("production-shaped FK/nullable metadata rows expose only 11 public fields; private excluded", async () => {
    await insertFictionalCourses();
    expect(await prisma.course.count()).toBe(4);
    expect(await prisma.course.count({ where: { isPrivate: false } })).toBe(3);
    expect(await prisma.courseReview.count()).toBe(1);
    const direct = await getPublicCoursesCatalog();
    assertPurePublic(direct);
    for (const row of direct) expect(row).toEqual(rows.find((item) => item.id === row.id));
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["data", "success"]);
    expect(body.success).toBe(true);
    assertPurePublic(body.data);
    for (const row of body.data) expect(row).toEqual(rows.find((item) => item.id === row.id));
  });

  it("guest flags only from actual source, profile-hidden PUBLIC still present, no invented ordering", async () => {
    const response = await request("/api/v1/public/courses?page=5&limit=1&sort=rating");
    expect(response.status).toBe(200);
    const body = await response.json();
    assertPurePublic(body.data);
    const byId = new Map<string, PublicCourseCatalogItem>(
      body.data.map((row: PublicCourseCatalogItem) => [row.id, row]),
    );
    expect(byId.get(F.free)).toMatchObject({
      hasAccess: true,
      isPaid: false,
      userStatus: "NOT_STARTED",
    });
    expect(byId.get(F.paid)).toMatchObject({ hasAccess: false, isPaid: true });
    expect(byId.get(F.unprofiled)).toMatchObject({ isPrivate: false, hasAccess: true });
    expect(byId.has(F.private)).toBe(false);
    // Source has neither orderBy nor pagination; only compare membership, NOT sorted position.
    expect(await prisma.course.count({ where: { isPrivate: false, showInProfile: false } })).toBe(
      1,
    );
  });
});
