/** Original training days/day READ vs restored work PG18 only.
 * No signed HTTP, StepOnDay write/progress, cache, media, provider or user data logging. */
import { afterAll, describe, it, vi } from "vitest";

const forbidden = vi.hoisted(() =>
  vi.fn((): never => {
    throw Error("FORBIDDEN_TRAINING_SIDE_EFFECT");
  }),
);
// Real Core readers & entitlement policy and Prisma are unmocked. Only unrelated
// rewarded unlock/write operations are never allowed to execute in this test.
vi.mock("../rewardedCredits", () => ({
  getPremiumOrRewardedAccess: forbidden,
  requirePremiumOrRewardedUnlock: forbidden,
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {},
}));
vi.mock("../trainerCourse/courseVersionService", () => ({ setCourseLogoVersioned: forbidden }));

import { prisma } from "@gafus/prisma";
import { getTrainingDays, getTrainingDayWithMonetizedSteps } from "./trainingService.ts";

const assertSafe = (ok: boolean, code: string): void => {
  if (!ok) throw Error(code);
};
const fixture = async () => {
  const granted = await prisma.courseAccess.findFirst({
    where: { course: { isPrivate: true, isPersonalized: false, dayLinks: { some: {} } } },
    select: {
      userId: true,
      course: {
        select: {
          id: true,
          type: true,
          dayLinks: {
            take: 1,
            orderBy: { order: "asc" },
            select: { id: true },
          },
        },
      },
    },
  });
  assertSafe(!!granted?.course.dayLinks[0], "NO_NONPERSONALIZED_PRIVATE_GRANTED_DAY");
  return granted!;
};

afterAll(async () => {
  await prisma.$disconnect();
});
describe("LEARN032 original private training Core GET against permanent work PG18", () => {
  it("checks the exact restricted work role and a physically read-only SQL session", async () => {
    const rows = await prisma.$queryRaw<
      { db: string; role: string; readonly: string; timeout: string }[]
    >`
      SELECT current_database() AS db, current_user AS role,
        current_setting('default_transaction_read_only') AS readonly,
        current_setting('statement_timeout') AS timeout`;
    assertSafe(
      rows.length === 1 && rows[0].db === "gafus_refactor_real_work_20261024",
      "DB_TARGET_MISMATCH",
    );
    assertSafe(rows[0].role === "gafus_refactor_local_real", "DB_ROLE_MISMATCH");
    assertSafe(rows[0].readonly === "on" && rows[0].timeout !== "0", "READ_ONLY_NOT_ENFORCED");
    process.stdout.write("AG1_LEARN032_REAL_WORK_DB_READ_ONLY_PASS\n");
  });

  it("uses original entitlement-scoped day list and day detail with no progress backfill", async () => {
    const grant = await fixture();
    const beforeTraining = await prisma.userTraining.count();
    const beforeSteps = await prisma.userStep.count();
    const days = await getTrainingDays(grant.userId, grant.course.type);
    assertSafe(
      days.courseId === grant.course.id && days.trainingDays.length > 0,
      "PRIVATE_GRANTED_DAYS_NOT_VISIBLE",
    );
    assertSafe(
      days.trainingDays.every(
        (day) => day.courseId === grant.course.id && typeof day.userStatus === "string",
      ),
      "TRAINING_LIST_WIRE_INVALID",
    );
    const physicalDayId = grant.course.dayLinks[0].id;
    const day = await getTrainingDayWithMonetizedSteps(
      grant.userId,
      grant.course.type,
      physicalDayId,
      {
        platform: "WEB_DESKTOP",
        createIfMissing: false,
      },
    );
    assertSafe(
      !!day && day.courseId === grant.course.id && day.dayOnCourseId === physicalDayId,
      "GRANTED_DETAIL_MISSING",
    );
    assertSafe(day !== null && Array.isArray(day.steps), "TRAINING_DETAIL_WIRE_INVALID");
    assertSafe(
      day !== null &&
        day.steps.every(
          (step) => typeof step.status === "string" && typeof step.title === "string",
        ),
      "STEP_WIRE_INVALID",
    );
    assertSafe(
      (await prisma.userTraining.count()) === beforeTraining,
      "READ_CREATED_USER_TRAINING",
    );
    assertSafe((await prisma.userStep.count()) === beforeSteps, "READ_CREATED_USER_STEP");
    assertSafe(forbidden.mock.calls.length === 0, "REWARDED_WRITE_IN_READ");
    process.stdout.write("AG1_LEARN032_REAL_PRIVATE_ASSIGNED_DAYS_DAY_NO_BACKFILL_PASS\n");
  });

  it("denies an unrelated existing actor without revealing a private training day", async () => {
    const grant = await fixture();
    const stranger = await prisma.user.findFirst({
      where: { courseAccesses: { none: { courseId: grant.course.id } } },
      select: { id: true },
    });
    assertSafe(!!stranger && stranger.id !== grant.userId, "NO_UNRELATED_ACTOR");
    const detail = await getTrainingDayWithMonetizedSteps(
      stranger!.id,
      grant.course.type,
      grant.course.dayLinks[0].id,
      {
        platform: "WEB_DESKTOP",
        createIfMissing: false,
      },
    );
    assertSafe(detail === null, "FOREIGN_PRIVATE_TRAINING_DETAIL_EXPOSED");
    let denied = false;
    try {
      await getTrainingDays(stranger!.id, grant.course.type);
    } catch (error) {
      denied = error instanceof Error && error.message === "COURSE_ACCESS_DENIED";
    }
    assertSafe(denied, "PRIVATE_DAYS_ACCESS_MUST_BE_DENIED");
    assertSafe(forbidden.mock.calls.length === 0, "FORBIDDEN_PROVIDER_CALL");
    process.stdout.write("AG1_LEARN032_REAL_PRIVATE_FOREIGN_ACTOR_DENIED_PASS\n");
  });
});
