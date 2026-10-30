/** Existing registered original Hono /courses; own synthetic users/courses; WORK PG18. */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";

const prefix = "ag1_courses_http_20261025_" + randomBytes(5).toString("hex");
const base = "http://127.0.0.1:3001/api/v1";
type Actor = { id: string; username: string; password: string; token?: string };
type OwnedCourse = { id: string; type: string };
const actors: Actor[] = [],
  courses: OwnedCourse[] = [];
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function ensure(v: unknown, n: string): asserts v {
  if (!v) throw Error("ASSERT_" + n);
}
function pass(n: string) {
  console.warn("AG1_COURSES_REAL_HTTP " + n + "=PASS");
}
async function http(path: string, method = "GET", user?: Actor, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(user?.token ? { Authorization: "Bearer " + user.token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  return { status: res.status, data: obj(await res.json()), headers: res.headers };
}
async function actor(role: "USER" | "TRAINER", suffix: string) {
  const password = randomBytes(28).toString("base64url");
  const row = await prisma.user.create({
    data: {
      username: prefix + "_" + suffix,
      role,
      password: await bcrypt.hash(password, 10),
      passwordSetAt: new Date(),
      registrationPending: false,
    },
  });
  const who: Actor = { id: row.id, username: row.username, password };
  actors.push(who);
  const logged = await http("/auth/login", "POST", undefined, {
    username: who.username,
    password,
  });
  ensure(logged.status === 200 && logged.data.success === true, "GENUINE_LOGIN");
  const token = obj(logged.data.data).accessToken;
  ensure(typeof token === "string" && token.length > 32, "GENUINE_JWT");
  who.token = token;
  return who;
}
async function addCourse(authorId: string, suffix: string, privateCourse: boolean, paid: boolean) {
  const type = "ag1_" + randomBytes(5).toString("hex") + "_" + suffix;
  const row = await prisma.course.create({
    data: {
      authorId,
      name: "AG1 " + suffix,
      shortDesc: "Synthetic GAFUS course",
      description: "Never paid/production",
      trainingLevel: "BEGINNER",
      duration: "1 week",
      logoImg: "",
      type,
      isPrivate: privateCourse,
      isPaid: paid,
    },
  });
  courses.push({ id: row.id, type: row.type });
  return row;
}
async function cleanup() {
  if (courses.length) {
    const ids = courses.map((c) => c.id);
    const trainer = actors[0]?.id;
    if (trainer) await prisma.course.deleteMany({ where: { id: { in: ids }, authorId: trainer } });
  }
  for (const u of actors) {
    const db = await prisma.user.findUnique({ where: { id: u.id }, select: { username: true } });
    if (db?.username === u.username && db.username.startsWith(prefix))
      await prisma.user.delete({ where: { id: u.id } });
  }
}
async function main() {
  ensure(process.env.AG1_COURSES_WORK_HTTP === "1", "EXPLICIT_OPTIN");
  const url = new URL(process.env.DATABASE_URL ?? "");
  ensure(
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.port === "55921" &&
      url.pathname === "/gafus_refactor_real_work_20261024",
    "WORK_PG_ONLY",
  );
  const version = await prisma.$queryRaw<{ db: string; version: string }[]>`
 SELECT current_database() AS db,current_setting('server_version_num') AS version`;
  ensure(
    version[0]?.db === "gafus_refactor_real_work_20261024" && version[0]?.version === "180004",
    "PG18",
  );
  ensure(
    (
      await fetch("http://127.0.0.1:3001/health", {
        signal: AbortSignal.timeout(5000),
      })
    ).status === 200,
    "HONO",
  );
  pass("ORIGINAL_HONO_WORK_PG18");
  const trainer = await actor("TRAINER", "trainer");
  const ordinary = await actor("USER", "ordinary");
  const member = await actor("USER", "member");
  pass("THREE_GENUINE_JWT_USERS");
  const free = await addCourse(trainer.id, "free", false, false);
  // Personalization is intentionally available only for personalized courses.
  await prisma.course.update({ where: { id: free.id }, data: { isPersonalized: true } });
  const paid = await addCourse(trainer.id, "paid", false, true);
  const hidden = await addCourse(trainer.id, "private", true, false);
  await prisma.courseAccess.create({ data: { courseId: hidden.id, userId: member.id } });
  const guest = await http("/public/courses");
  const list = guest.data.data;
  ensure(guest.status === 200 && Array.isArray(list), "PUBLIC_GUEST_CATALOG");
  const itemFree = list.map(obj).find((x) => x.id === free.id);
  const itemPaid = list.map(obj).find((x) => x.id === paid.id);
  ensure(itemFree?.hasAccess === true && itemFree.isPaid === false, "PUBLIC_FREE");
  ensure(itemPaid?.hasAccess === false && itemPaid.isPaid === true, "PUBLIC_PREMIUM_TEASER");
  ensure(!list.map(obj).some((x) => x.id === hidden.id), "PUBLIC_PRIVATE_NOT_LEAKED");
  ensure(guest.headers.get("cache-control") === "public, max-age=60", "GUEST_CACHE");
  for (const item of [itemFree, itemPaid]) {
    ensure(
      item &&
        !JSON.stringify(item).includes(trainer.id) &&
        !JSON.stringify(item).includes("dayLinks") &&
        !JSON.stringify(item).includes("userCourses"),
      "PUBLIC_WHITELIST",
    );
  }
  pass("GUEST_FREE_PAID_PRIVATE_WHITELIST");
  const ordinaryGet = await http("/courses", "GET", ordinary);
  const memberGet = await http("/courses", "GET", member);
  ensure(
    ordinaryGet.status === 200 &&
      ordinaryGet.data.success === true &&
      memberGet.status === 200 &&
      memberGet.data.success === true,
    "SIGNED_LISTS",
  );
  const ord = ordinaryGet.data.data,
    mem = memberGet.data.data;
  ensure(Array.isArray(ord) && Array.isArray(mem), "SIGNED_CATALOG_ARRAY");
  ensure(
    ord.map(obj).some((c) => c.id === free.id) &&
      ord.map(obj).some((c) => c.id === paid.id) &&
      !ord.map(obj).some((c) => c.id === hidden.id),
    "PRIVATE_NOT_IN_ORDINARY_LIST",
  );
  ensure(
    mem.map(obj).some((c) => c.id === hidden.id),
    "PRIVATE_MEMBER_VISIBLE",
  );
  const metadata = await http(
    "/courses/metadata?courseType=" + encodeURIComponent(free.type),
    "GET",
    ordinary,
  );
  const notMetadata = await http(
    "/courses/metadata?courseType=" + encodeURIComponent(hidden.type),
    "GET",
    ordinary,
  );
  ensure(metadata.status === 200 && notMetadata.status === 404, "PUBLIC_METADATA_PRIVATE404");
  ensure(ordinaryGet.headers.get("cache-control") === "private, no-store", "PRIVATE_CATALOG_CACHE");
  pass("SIGNED_COURSE_MEMBERSHIP_PRIVATE_METADATA");
  const add = await http("/courses/favorites", "POST", ordinary, {
    courseId: free.id,
    action: "add",
  });
  const repeated = await http("/courses/favorites", "POST", ordinary, {
    courseId: free.id,
    action: "add",
  });
  ensure(
    add.status === 200 &&
      repeated.status === 200 &&
      obj(add.data.data).isFavorite === true &&
      obj(repeated.data.data).isFavorite === true,
    "FAVORITE_ADD_REPLAY",
  );
  ensure(
    (await prisma.favoriteCourse.count({ where: { userId: ordinary.id, courseId: free.id } })) ===
      1,
    "SQL_ONE_FAVORITE",
  );
  const favorites = await http("/courses/favorites", "GET", ordinary);
  ensure(
    favorites.status === 200 &&
      favorites.data.success === true &&
      JSON.stringify(favorites.data.data).includes(free.id),
    "FAVORITES_READBACK",
  );
  const memberFavorites = await http("/courses/favorites", "GET", member);
  ensure(
    memberFavorites.status === 200 && !JSON.stringify(memberFavorites.data.data).includes(free.id),
    "FOREIGN_FAVORITE_PRIVACY",
  );
  const removed = await http("/courses/favorites", "POST", ordinary, {
    courseId: free.id,
    action: "remove",
  });
  ensure(
    removed.status === 200 &&
      obj(removed.data.data).isFavorite === false &&
      (await prisma.favoriteCourse.count({ where: { userId: ordinary.id, courseId: free.id } })) ===
        0,
    "FAVORITE_REMOVE_SQL",
  );
  pass("FAVORITES_IDEMPOTENT_OWNER_SQL_GET");
  const personalized = await http("/courses/personalization", "POST", ordinary, {
    courseId: free.id,
    userDisplayName: "AG1 Owner",
    userGender: "male",
    petName: "AG1 Dog",
    petGender: "male",
  });
  ensure(
    personalized.status === 200 && personalized.data.success === true,
    "PERSONALIZATION_WRITE_200",
  );
  const personalizedRow = await prisma.userCourse.findUnique({
    where: { userId_courseId: { userId: ordinary.id, courseId: free.id } },
  });
  ensure(
    personalizedRow?.userDisplayName === "AG1 Owner" && personalizedRow.petName === "AG1 Dog",
    "PERSONALIZATION_SQL",
  );
  const invalid = await http("/courses/personalization", "POST", member, {
    courseId: free.id,
    userDisplayName: "",
    userGender: "unknown",
    petName: "",
  });
  ensure(invalid.status === 400, "PERSONALIZATION_BAD_400");
  pass("USER_PERSONALIZATION_SQL_AND_VALIDATION");
  const early = await http("/courses/reviews", "POST", ordinary, {
    courseType: free.type,
    rating: 5,
    comment: "Nice",
  });
  ensure(
    early.status === 400 &&
      (await prisma.courseReview.count({
        where: { userId: ordinary.id, courseId: free.id },
      })) === 0,
    "PRE_COMPLETION_REVIEW_400",
  );
  await prisma.userCourse.update({
    where: {
      userId_courseId: {
        userId: ordinary.id,
        courseId: free.id,
      },
    },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  const created = await http("/courses/reviews", "POST", ordinary, {
    courseType: free.type,
    rating: 5,
    comment: "AG1 synthetic review",
  });
  ensure(created.status === 200 && created.data.success, "REVIEW_AFTER_COMPLETION");
  const review = await prisma.courseReview.findUnique({
    where: {
      userId_courseId: { userId: ordinary.id, courseId: free.id },
    },
  });
  ensure(review?.rating === 5 && review.comment === "AG1 synthetic review", "REVIEW_PHYSICAL_SQL");
  const getReviews = await http(
    "/courses/reviews?courseType=" + encodeURIComponent(free.type),
    "GET",
    ordinary,
  );
  ensure(
    getReviews.status === 200 &&
      getReviews.data.success &&
      JSON.stringify(getReviews.data.data).includes(review.id),
    "REVIEWS_GET",
  );
  const forbidden = await http("/courses/reviews", "PATCH", member, {
    reviewId: review.id,
    rating: 1,
    comment: "Foreign",
  });
  ensure(forbidden.status === 400, "FOREIGN_REVIEW_MODIFICATION_BLOCKED");
  const revised = await http("/courses/reviews", "PATCH", ordinary, {
    reviewId: review.id,
    rating: 4,
    comment: "AG1 revised",
  });
  ensure(revised.status === 200, "REVIEW_UPDATE");
  expectRating = (await prisma.courseReview.findUnique({ where: { id: review.id } }))?.rating;
  ensure(expectRating === 4, "REVIEW_UPDATE_SQL");
  const deleted = await http("/courses/reviews", "DELETE", ordinary, { reviewId: review.id });
  ensure(
    deleted.status === 200 && (await prisma.courseReview.count({ where: { id: review.id } })) === 0,
    "REVIEW_DELETE_SQL",
  );
  pass("REVIEW_COMPLETION_OWNER_PERMISSION_FULL_CRUD_SQL");
}
let expectRating: number | null | undefined;
void (async () => {
  try {
    await main();
  } catch (e) {
    process.exitCode = 1;
    console.error(
      "AG1_COURSES_REAL_HTTP_FAILED",
      e instanceof Error && e.message.startsWith("ASSERT_") ? e.message : "UNEXPECTED_REDACTED",
    );
  } finally {
    try {
      await cleanup();
      console.warn("AG1_COURSES_REAL_HTTP_OWN_CLEANUP=PASS");
    } catch {
      process.exitCode = 1;
      console.error("AG1_COURSES_REAL_HTTP_CLEANUP_REVIEW_REQUIRED");
    }
    await prisma.$disconnect();
  }
})();
