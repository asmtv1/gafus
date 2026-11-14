/** Critical read composition emits low-cardinality stages without changing
 * principal-scoped arguments, result envelopes, or error propagation. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  spans: [] as string[],
  byType: vi.fn(async () => ({ hasAccess: true })),
  byId: vi.fn(async () => ({ hasAccess: true })),
  day: vi.fn(async () => ({ dayId: "own-day" })),
  stats: vi.fn(async () => ({ scope: "own" })),
  dates: vi.fn(async () => [] as Date[]),
  bundles: vi.fn(async () => []),
  bundleSteps: vi.fn(async () => []),
  schedule: vi.fn(async () => []),
  candidates: vi.fn(async () => []),
  ownArticles: vi.fn(async () => []),
}));
vi.mock("../lib/operation-observability.js", () => ({
  withCorrelatedUseCase: async <T>(name: string, action: () => Promise<T>) => {
    m.spans.push(name);
    return action();
  },
}));
vi.mock("@gafus/core/services/course", () => ({
  checkCourseAccess: m.byType, checkCourseAccessById: m.byId,
}));
vi.mock("@gafus/core/services/training", () => ({
  getTrainingDayWithMonetizedSteps: m.day,
}));
vi.mock("@gafus/achievements-server", () => ({
  getAchievementStats: m.stats, getUserTrainingDates: m.dates,
}));
vi.mock("./daily-course/composition/dailyCourseApplication.js", () => ({
  getDailyCourseBundles: m.bundles,
  getDailyCourseBundleStepCandidates: m.bundleSteps,
  getDailyCourseScheduleRange: m.schedule,
  getDailyCourseCandidates: m.candidates,
}));
vi.mock("./trainer-articles/infrastructure/read-own-article-metadata-rows.js", () => ({
  readTrainerOwnArticleMetadataRows: m.ownArticles,
}));

import { readCourseAccessApplication } from "./courses/composition/read-access.js";
import { readTrainingDayApplication } from "./training/composition/read-training-day.js";
import { readAchievementsApplication } from "./achievements/composition/read-achievements.js";
import { readTrainerDailyApplication } from "./trainer-daily/composition/read-trainer-daily.js";
import { readTrainerOwnArticleMetadataApplication } from "./trainer-articles/composition/read-own-article-metadata.js";

beforeEach(() => {
  vi.clearAllMocks();
  m.spans.length = 0;
});

describe("correlated critical read composition", () => {
  it("instruments all eleven scoped reads without putting actor or object IDs into span names", async () => {
    const actor = { id: "PRIVATE_ACTOR_ID", role: "TRAINER" };
    await expect(readCourseAccessApplication.execute({ actorUserId: actor.id, courseId: "SECRET_COURSE_ID" }))
      .resolves.toEqual({ hasAccess: true });
    await readCourseAccessApplication.execute({ actorUserId: actor.id, courseType: "GENERAL" });
    await expect(readTrainingDayApplication.execute({
      actorUserId: actor.id, courseType: "GENERAL", dayOnCourseId: "PRIVATE_DAY_ID", options: {} as never,
    })).resolves.toMatchObject({ kind: "found" });
    m.day.mockResolvedValueOnce(null as never);
    await readTrainingDayApplication.execute({
      actorUserId: actor.id, courseType: "GENERAL", dayOnCourseId: "MISSING_DAY", options: {} as never,
    });
    await readAchievementsApplication.stats({ actorUserId: actor.id });
    await readAchievementsApplication.trainingDates({ actorUserId: actor.id });
    await readTrainerDailyApplication.bundles(actor as never);
    await readTrainerDailyApplication.bundleStepCandidates(actor as never);
    await readTrainerDailyApplication.scheduleRange(actor as never, { from: "2026-11-01", to: "2026-11-02" } as never);
    await readTrainerDailyApplication.candidates(actor as never);
    await expect(readTrainerOwnArticleMetadataApplication.execute({ actorUserId: actor.id }))
      .resolves.toEqual({ articles: [] });
    expect(m.spans).toEqual([
      "courses.entitlement.id.read", "courses.entitlement.type.read",
      "training.day.detail.read", "training.day.detail.read", "training.day.access.read",
      "achievements.stats.read", "achievements.training_dates.read",
      "trainer.daily.bundles.read", "trainer.daily.step_candidates.read",
      "trainer.daily.schedule.read", "trainer.daily.candidates.read",
      "trainer.articles.own_metadata.read",
    ]);
    expect(m.spans.join(" ")).not.toContain(actor.id);
    expect(m.spans.join(" ")).not.toContain("SECRET_COURSE_ID");
    expect(m.spans.join(" ")).not.toContain("PRIVATE_DAY_ID");
    expect(m.byId).toHaveBeenCalledWith("SECRET_COURSE_ID", actor.id);
    expect(m.stats).toHaveBeenCalledWith(actor.id);
    expect(m.ownArticles).toHaveBeenCalledWith(actor.id);
  });

  it("does not swallow provider errors or silently permit a denied course", async () => {
    m.byId.mockRejectedValueOnce(new Error("COURSE_DB_UNAVAILABLE"));
    await expect(readCourseAccessApplication.execute({ actorUserId: "owner", courseId: "course" }))
      .rejects.toThrow("COURSE_DB_UNAVAILABLE");
    expect(m.spans).toEqual(["courses.entitlement.id.read"]);
    m.spans.length = 0;
    m.byType.mockResolvedValueOnce({ hasAccess: false });
    await expect(readCourseAccessApplication.execute({ actorUserId: "owner", courseType: "PAID" }))
      .resolves.toMatchObject({ hasAccess: false });
    expect(m.spans).toEqual(["courses.entitlement.type.read"]);
  });
});
