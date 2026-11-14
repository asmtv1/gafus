/** Correlated mutation spans must preserve all command parameters, including
 * the optional owner-bound idempotency binding, without logging payloads. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  spans: [] as string[],
  day: vi.fn(async (..._args: unknown[]) => ({ dayId: "own-day" })),
  dailyStep: vi.fn(async (..._args: unknown[]) => ({ success: true })),
  list: vi.fn(async (..._args: unknown[]) => []),
  create: vi.fn(async (..._args: unknown[]) => ({ success: true })),
  batch: vi.fn(async (..._args: unknown[]) => ({ success: true })),
  update: vi.fn(async (..._args: unknown[]) => ({ success: true })),
  remove: vi.fn(async (..._args: unknown[]) => ({ success: true })),
  trainingStep: vi.fn(async (..._args: unknown[]) => ({ success: true })),
  status: vi.fn(async (..._args: unknown[]) => ({ seen: false })),
  seen: vi.fn(async (..._args: unknown[]) => ({ seen: true })),
}));
vi.mock("../lib/operation-observability.js", () => ({
  withCorrelatedUseCase: async <T>(name: string, action: () => Promise<T>) => {
    m.spans.push(name);
    return action();
  },
}));
vi.mock("./daily-course/composition/dailyCourseApplication.js", () => ({
  getDailyCourseDayWithUserSteps: m.day, updateDailyCourseStepAndDay: m.dailyStep,
}));
vi.mock("@gafus/core/services/petPrevention", () => ({
  getEntriesByPet: m.list, createEntry: m.create,
  upsertPreventionEntriesBatch: m.batch, updateEntry: m.update,
  deleteEntry: m.remove,
}));
vi.mock("@gafus/core/services/training", () => ({ updateStepAndDay: m.trainingStep }));
vi.mock("@gafus/core/services/user", () => ({
  getOnboardingTourStatus: m.status, markOnboardingTourSeen: m.seen,
}));
import { dayAndStepCommandsApplication } from "./learner-daily/composition/day-and-step-commands.js";
import { preventionJournalApplication } from "./pet-prevention/composition/journal.js";
import { writeStepProgressApplication } from "./training/composition/write-step-progress.js";
import { onboardingTourApplication } from "./user/composition/onboarding-tour.js";

beforeEach(() => { vi.clearAllMocks(); m.spans.length = 0; });

describe("critical write spans preserve Core command boundaries", () => {
  it("keeps all ten immutable stage labels and exact optional owner-bound arguments", async () => {
    const owner = "PRIVATE_OWNER_ID";
    const binding = { id: "PRIVATE_BINDING_ID" } as never;
    const draft = { title: "PRIVATE_DRAFT_CONTENT" } as never;
    await dayAndStepCommandsApplication.getDay(owner, "schedule-id", {} as never);
    await dayAndStepCommandsApplication.updateStep(owner, "schedule-id", 1, "COMPLETE" as never);
    await dayAndStepCommandsApplication.updateStep(owner, "schedule-id", 1, "COMPLETE" as never, binding);
    await preventionJournalApplication.list(owner, "pet-id");
    await preventionJournalApplication.create(owner, "pet-id", draft);
    await preventionJournalApplication.batch(owner, "pet-id", [draft] as never);
    await preventionJournalApplication.update(owner, "pet-id", "entry-id", draft);
    await preventionJournalApplication.remove(owner, "pet-id", "entry-id");
    await writeStepProgressApplication.execute(owner, "course-day", 3, "COMPLETE" as never);
    await writeStepProgressApplication.execute(owner, "course-day", 3, "COMPLETE" as never, binding);
    await onboardingTourApplication.getStatus(owner);
    await onboardingTourApplication.complete(owner);

    expect(m.spans).toEqual([
      "learner.daily.day.read_or_create", "learner.daily.step.update", "learner.daily.step.update",
      "pets.prevention.entries.read", "pets.prevention.entry.create",
      "pets.prevention.entries.batch_upsert", "pets.prevention.entry.update",
      "pets.prevention.entry.delete", "training.step_progress.update", "training.step_progress.update",
      "user.onboarding_tour.status.read", "user.onboarding_tour.seen.update",
    ]);
    expect(m.spans.join(" ")).not.toMatch(/PRIVATE_OWNER_ID|PRIVATE_BINDING_ID|PRIVATE_DRAFT_CONTENT/);
    expect(m.day).toHaveBeenCalledExactlyOnceWith(owner, "schedule-id", {});
    expect(m.dailyStep.mock.calls[0]).toHaveLength(4);
    expect(m.dailyStep.mock.calls[1]).toEqual([owner, "schedule-id", 1, "COMPLETE", binding]);
    expect(m.trainingStep.mock.calls[0]).toHaveLength(4);
    expect(m.trainingStep.mock.calls[1]).toEqual([owner, "course-day", 3, "COMPLETE", binding]);
    expect(m.batch).toHaveBeenCalledWith(owner, "pet-id", [draft]);
    expect(m.seen).toHaveBeenCalledExactlyOnceWith(owner);
  });
  it("never acknowledges a failed Core mutation as a successful write", async () => {
    const error = new Error("DB_TRANSACTION_ROLLED_BACK");
    m.create.mockRejectedValueOnce(error);
    await expect(preventionJournalApplication.create("owner", "pet-id", {} as never))
      .rejects.toBe(error);
    expect(m.spans).toEqual(["pets.prevention.entry.create"]);
  });
});
