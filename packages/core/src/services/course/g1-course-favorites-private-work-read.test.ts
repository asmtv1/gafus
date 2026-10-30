/** Original Course Core catalog against restricted permanent work PG18, READ only.
 * No Hono actor identity, login, production provider or fixture writes. */
import { afterAll, describe, it, vi } from "vitest";

const blocked = vi.hoisted(() =>
  vi.fn((): never => {
    throw Error("NON_READ_SIDE_EFFECT_DENIED");
  }),
);
vi.mock("../trainerCourse/courseVersionService", () => ({ setCourseLogoVersioned: blocked }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: blocked, warn: blocked, error: blocked, success: blocked }),
}));

import { prisma } from "@gafus/prisma";
import { getCoursesWithProgress } from "./courseService";

const requireTrue = (condition: boolean, code: string) => {
  if (!condition) throw Error(code);
};
type PrivateMembership = { favoritedBy: { userId: string }[] };
const members = (value: unknown): { userId: string }[] => {
  const relation = (value as PrivateMembership).favoritedBy;
  requireTrue(
    Array.isArray(relation) && relation.every((m) => typeof m?.userId === "string"),
    "MEMBERSHIP_WIRE_INVALID",
  );
  return relation;
};

afterAll(async () => {
  await prisma.$disconnect();
});
describe("G1 original Core catalog only selects the requesting user's favorite rows", () => {
  it("checks real Prisma session role, work database and physical read-only enforcement", async () => {
    const [ctx] = await prisma.$queryRaw<
      { database: string; role: string; readOnly: string; timeout: string }[]
    >`
      SELECT current_database() AS database, current_user AS role,
        current_setting('default_transaction_read_only') AS "readOnly",
        current_setting('statement_timeout') AS timeout`;
    requireTrue(!!ctx && ctx.database === "gafus_refactor_real_work_20261024", "INVALID_WORK_DB");
    requireTrue(ctx.role === "gafus_refactor_local_real", "INVALID_APP_ROLE");
    requireTrue(ctx.readOnly === "on" && ctx.timeout !== "0", "READ_ONLY_GUARD_MISSING");
    process.stdout.write("AG1_COURSES_REAL_WORK_READ_ONLY_CONTEXT_PASS\n");
  });
  it("reads real favorited public course for its actor; no other membership in output", async () => {
    const fixture = await prisma.favoriteCourse.findFirst({
      where: { course: { isPrivate: false } },
      select: { userId: true, courseId: true },
    });
    requireTrue(!!fixture, "NO_REAL_PUBLIC_FAVORITES");
    if (!fixture) return;
    const rows = await getCoursesWithProgress(fixture.userId);
    requireTrue(rows.length > 0, "NO_VISIBLE_PUBLIC_COURSES");
    requireTrue(
      rows.every((row) => !row.isPrivate || row.hasAccess),
      "PRIVATE_COURSE_WITHOUT_ACCESS",
    );
    requireTrue(
      rows.every((row) => members(row).every((m) => m.userId === fixture.userId)),
      "FOREIGN_FAVORITE_MEMBERS_EXPOSED",
    );
    const owned = rows.find((row) => row.id === fixture.courseId);
    requireTrue(
      !!owned && owned.isFavorite && members(owned).length === 1,
      "OWN_FAVORITE_NOT_PRESERVED",
    );
    process.stdout.write("AG1_COURSES_REAL_FAVORITE_OWN_SCOPE_PASS\n");
  });
  it("does not emit any favorite member IDs for an anonymous catalog", async () => {
    const rows = await getCoursesWithProgress();
    requireTrue(rows.length > 0, "EMPTY_REAL_PUBLIC_COURSES");
    requireTrue(
      rows.every((row) => !row.isPrivate && !row.isFavorite && members(row).length === 0),
      "ANON_FAVORITE_MEMBER_LEAK",
    );
    requireTrue(blocked.mock.calls.length === 0, "FORBIDDEN_WRITE_MODULE_CALLED");
    process.stdout.write("AG1_COURSES_REAL_ANONYMOUS_MEMBERSHIP_EMPTY_PASS\n");
  });
});
