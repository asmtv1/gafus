/** AG1-090 COURSE030: original review Core, real Prisma, private production-shaped PG18. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  createCourseReview,
  updateCourseReview,
  deleteCourseReview,
  getCourseReviews,
  rateCourse,
} from "./reviewService";
import { createWriteReviewsApplication } from "../../../../../apps/api/src/modules/courses/application/write-reviews";
import { createCourseReadApplication } from "../../../../../apps/api/src/modules/courses/application/read-courses";

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));
const name = "gafus_refactor_course_reviews_ag1_20261024";
const datadir =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_course030_reviews_20261024";
const base = "ag1_course_review_sql_20261024_";
const id = (name: string) => base + name;
const ids = {
  author: id("trainer"),
  a: id("learner_completed"),
  b: id("learner_unfinished"),
  c: id("learner_foreign"),
  course: id("course"),
  authorProfile: id("profile"),
  aProfile: id("learner_profile"),
};
const courseType = "ag1_sql_review_20261024";
const allActors = [ids.author, ids.a, ids.b, ids.c];
const completedAt = new Date("2031-02-03T12:00:00.000Z");
const privateMarker = "FICTIONAL_PRIVATE_PROJECTION_MUST_NOT_LEAK";
let seeded = false;
const writeApp = createWriteReviewsApplication({
  create: createCourseReview,
  rate: rateCourse,
  update: updateCourseReview,
  remove: deleteCourseReview,
});
const readApp = createCourseReadApplication({
  catalog: async () => {
    throw Error("NO_CATALOG_SERVICE_ALLOWED");
  },
  favorites: async () => {
    throw Error("NO_FAVORITES_SERVICE_ALLOWED");
  },
  metadata: async () => {
    throw Error("NO_METADATA_SERVICE_ALLOWED");
  },
  reviews: getCourseReviews,
});

async function identity() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.G1_AG1_COURSE_REVIEW_PG18).toBe("1");
  expect([
    u.protocol,
    u.hostname,
    u.port,
    u.pathname,
    u.searchParams.get("host"),
    u.searchParams.get("application_name"),
    u.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${name}`, socket, appTag, ""]);
  const rows = await prisma.$queryRaw<
    {
      db: boolean;
      version: boolean;
      data: boolean;
      noTcp: boolean;
      socket: boolean;
      outsiders: bigint;
    }[]
  >`
    SELECT current_database()=${name} AS db,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${datadir} AS data,
      current_setting('listen_addresses')='' AS "noTcp",
      current_setting('unix_socket_directories')=${socket} AS socket,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
        AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${name}
          OR application_name IS DISTINCT FROM ${appTag})) AS outsiders
  `;
  expect(rows).toEqual([
    { db: true, version: true, data: true, noTcp: true, socket: true, outsiders: 0n },
  ]);
}
async function stored() {
  return prisma.courseReview.findUnique({
    where: { userId_courseId: { userId: ids.a, courseId: ids.course } },
  });
}
async function readA() {
  return readApp.getReviews({ courseType, actorUserId: ids.a });
}

beforeAll(async () => {
  await identity();
  const pre = await prisma.$queryRaw<
    { users: bigint; courses: bigint; reviews: bigint; ledger: bigint; missingVersion: bigint }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS users,
      (SELECT count(*) FROM public."Course") AS courses,
      (SELECT count(*) FROM public."CourseReview") AS reviews,
      (SELECT count(*) FROM public._prisma_migrations) AS ledger,
      (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
        AND table_name='Course' AND column_name='version') AS "missingVersion"
  `;
  expect(pre).toEqual([{ users: 0n, courses: 0n, reviews: 0n, ledger: 0n, missingVersion: 0n }]);
  await prisma.user.createMany({
    data: allActors.map((actor) => ({
      id: actor,
      username: actor,
      password: "fictional-not-a-real-password",
    })),
  });
  seeded = true;
  await prisma.userProfile.create({
    data: {
      id: ids.authorProfile,
      userId: ids.author,
      fullName: privateMarker,
      avatarUrl: "synthetic-avatar-only",
    },
  });
  await prisma.userProfile.create({
    data: { id: ids.aProfile, userId: ids.a, fullName: privateMarker, avatarUrl: null },
  });
  // Fixture, not Core: only 19 original production Course columns, no version/CAS workaround.
  await prisma.$executeRaw`
    INSERT INTO public."Course" ("id","name","type","trainingLevel",
      "duration","logoImg","authorId","updatedAt")
    VALUES (${ids.course},'Fictional review course',${courseType},
      'BEGINNER'::"TrainingLevel",'12 min','fictional-no-image',${ids.author},CURRENT_TIMESTAMP)
  `;
  await prisma.userCourse.createMany({
    data: [
      { userId: ids.a, courseId: ids.course, status: "COMPLETED", completedAt },
      { userId: ids.b, courseId: ids.course, status: "IN_PROGRESS", startedAt: completedAt },
      { userId: ids.author, courseId: ids.course, status: "COMPLETED", completedAt },
    ],
  });
}, 45000);

afterAll(async () => {
  try {
    await identity();
    if (seeded) {
      await prisma.courseReview.deleteMany({
        where: { courseId: ids.course, userId: { in: allActors } },
      });
      await prisma.userCourse.deleteMany({
        where: { courseId: ids.course, userId: { in: allActors } },
      });
      await prisma.$executeRaw`DELETE FROM public."Course" WHERE id=${ids.course}`;
      await prisma.userProfile.deleteMany({
        where: { id: { in: [ids.authorProfile, ids.aProfile] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: allActors } } });
    }
    const post = await prisma.$queryRaw<
      { users: bigint; courses: bigint; reviews: bigint; profiles: bigint; ledger: bigint }[]
    >`
      SELECT (SELECT count(*) FROM public."User") AS users,
        (SELECT count(*) FROM public."Course") AS courses,
        (SELECT count(*) FROM public."CourseReview") AS reviews,
        (SELECT count(*) FROM public."UserProfile") AS profiles,
        (SELECT count(*) FROM public._prisma_migrations) AS ledger
    `;
    expect(post).toEqual([{ users: 0n, courses: 0n, reviews: 0n, profiles: 0n, ledger: 0n }]);
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

describe("COURSE030 existing reviews real Prisma and PG18 archive-schema", () => {
  it("GET before create is empty and reports completed learner status", async () => {
    const get = await readA();
    expect(get).toEqual({
      courseName: "Fictional review course",
      reviews: [],
      userStatus: { hasCompleted: true, userReview: null },
    });
    const other = await getCourseReviews(courseType, ids.b);
    expect(other?.userStatus).toEqual({ hasCompleted: false, userReview: null });
    expect(await getCourseReviews("fictional-not-existing", ids.a)).toBeNull();
  });
  it("unfinished learner and unassigned learner cannot create; review stays absent", async () => {
    expect(await createCourseReview(ids.b, courseType, 4, "no completion")).toEqual({
      success: false,
      error: "Вы должны завершить курс чтобы оставить отзыв",
    });
    expect(await createCourseReview(ids.c, courseType, 4, "no enrollment")).toEqual({
      success: false,
      error: "Вы должны завершить курс чтобы оставить отзыв",
    });
    expect(await prisma.courseReview.count({ where: { courseId: ids.course } })).toBe(0);
  });
  it("learner author with completed course is allowed by existing Core policy; no invented self-denial", async () => {
    // The production Core checks COMPLETED only, it has no author self-denial.
    const progress = await prisma.userCourse.findUnique({
      where: { userId_courseId: { userId: ids.author, courseId: ids.course } },
    });
    expect(progress?.status).toBe("COMPLETED");
    // The current Core has no author-self rule; verify its actual behavior rather
    // than introducing a speculative restriction in the test or production.
    expect(await createCourseReview(ids.author, courseType, 3, "Fictional author review")).toEqual({
      success: true,
    });
    const authorReview = await prisma.courseReview.findUnique({
      where: { userId_courseId: { userId: ids.author, courseId: ids.course } },
    });
    expect(authorReview).toMatchObject({ userId: ids.author, rating: 3 });
    expect(await deleteCourseReview(ids.author, authorReview!.id)).toEqual({ success: true });
    expect(await prisma.courseReview.count({ where: { courseId: ids.course } })).toBe(0);
  });
  it("create → GET → edit → GET → delete → GET on real Core and real SQL", async () => {
    expect(
      await writeApp.createOrRate({
        actorUserId: ids.a,
        courseType,
        rating: 4,
        comment: "Fictional course feedback",
      }),
    ).toEqual({ success: true });
    const own = await stored();
    expect(
      (await prisma.course.findUnique({ where: { id: ids.course }, select: { avgRating: true } }))
        ?.avgRating,
    ).toBe(4);
    expect(own).not.toBeNull();
    expect(own).toMatchObject({
      userId: ids.a,
      courseId: ids.course,
      rating: 4,
      comment: "Fictional course feedback",
    });
    let result = await readA();
    expect(result?.reviews).toHaveLength(1);
    expect(result?.userStatus.hasCompleted).toBe(true);
    expect(result?.userStatus.userReview?.id).toBe(own?.id);
    expect(result?.reviews[0]).toMatchObject({
      id: own?.id,
      rating: 4,
      comment: "Fictional course feedback",
      user: { id: ids.a, username: ids.a, profile: { avatarUrl: null } },
    });
    expect(Object.keys(result?.reviews[0] ?? {}).sort()).toEqual([
      "comment",
      "createdAt",
      "id",
      "rating",
      "user",
    ]);
    expect(Object.keys(result?.reviews[0]?.user ?? {}).sort()).toEqual([
      "id",
      "profile",
      "username",
    ]);
    expect(JSON.stringify(result)).not.toContain(privateMarker);
    expect(await createCourseReview(ids.a, courseType, 5, "duplicate")).toEqual({
      success: false,
      error: "Вы уже оставили отзыв на этот курс",
    });
    expect(await prisma.courseReview.count({ where: { courseId: ids.course } })).toBe(1);
    expect(
      await writeApp.update({
        actorUserId: ids.b,
        reviewId: own!.id,
        rating: 2,
        comment: "not my review",
      }),
    ).toEqual({ success: false, error: "Вы можете редактировать только свои отзывы" });
    expect(await writeApp.remove({ actorUserId: ids.b, reviewId: own!.id })).toEqual({
      success: false,
      error: "Вы можете удалять только свои отзывы",
    });
    expect(
      await writeApp.update({
        actorUserId: ids.a,
        reviewId: own!.id,
        rating: 5,
        comment: "Updated fictional feedback",
      }),
    ).toEqual({ success: true });
    result = await readA();
    expect(
      (await prisma.course.findUnique({ where: { id: ids.course }, select: { avgRating: true } }))
        ?.avgRating,
    ).toBe(5);
    expect(result?.reviews).toHaveLength(1);
    expect(result?.userStatus.userReview).toMatchObject({
      id: own?.id,
      rating: 5,
      comment: "Updated fictional feedback",
    });
    expect(JSON.stringify(result)).not.toContain(privateMarker);
    expect(await writeApp.remove({ actorUserId: ids.a, reviewId: own!.id })).toEqual({
      success: true,
    });
    result = await readA();
    expect(
      (await prisma.course.findUnique({ where: { id: ids.course }, select: { avgRating: true } }))
        ?.avgRating,
    ).toBeNull();
    expect(result?.reviews).toEqual([]);
    expect(result?.userStatus).toEqual({ hasCompleted: true, userReview: null });
    expect(await stored()).toBeNull();
  });
});
