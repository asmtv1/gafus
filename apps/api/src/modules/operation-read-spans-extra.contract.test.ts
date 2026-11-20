/** Correlated read spans are composition concerns: do not change owner scoping,
 * response mapping, provider errors, or the consultation header lifecycle. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { profileRows } from "./user/composition/profile-rows-instance.js";

const m = vi.hoisted(() => ({
  spans: [] as string[],
  order: [] as string[],
  catalog: vi.fn(async () => []),
  eligibility: vi.fn(async (): Promise<{ canBook: boolean; reason: string | null; nextBookingAt: string | null; message: string | null }> => ({ canBook: true, reason: null, nextBookingAt: null, message: null })),
  examResult: vi.fn(async () => null),
  today: vi.fn(async () => null),
  days: vi.fn(async () => []),
  exams: vi.fn(async () => []),
  pendingExams: vi.fn(async () => []),
  notes: vi.fn(async () => ({ notes: [], total: 0 })),
  steps: vi.fn(async () => []),
  templates: vi.fn(async () => []),
  trainingDays: vi.fn(async () => []),
  publicProfile: vi.fn(async () => null),
}));
vi.mock("../lib/operation-observability.js", () => ({
  withCorrelatedUseCase: async <T>(name: string, action: () => Promise<T>) => {
    m.spans.push(name);
    return action();
  },
}));
vi.mock("./consultations/composition/booking-eligibility.js", () => ({
  getConsultationBookingEligibility: m.eligibility,
}));
vi.mock("./consultations/composition/catalog-schedule.js", () => ({
  listListedCynologists: m.catalog,
}));
vi.mock("@gafus/exam-server/exam-service", () => ({
  getExamResult: m.examResult, getExamResults: m.exams,
  getPendingExamResults: m.pendingExams,
}));
vi.mock("./daily-course/composition/dailyCourseApplication.js", () => ({ getTodayDailyCourse: m.today }));
vi.mock("@gafus/core/services/trainingDay", () => ({ getVisibleDays: m.days }));
vi.mock("./trainer-notes/infrastructure/read-notes-summary-snapshot.js", () => ({
  readTrainerNotesSummarySnapshot: m.notes,
}));
vi.mock("@gafus/core/services/trainerStep", () => ({
  getVisibleSteps: m.steps, getStepTemplates: m.templates,
}));
vi.mock("@gafus/core/services/training", () => ({ getTrainingDays: m.trainingDays }));
vi.mock("@gafus/core/services/user", () => ({ getPublicProfile: m.publicProfile }));

import { listCynologistsApplication } from "./consultations/composition/list-cynologists.js";
import { readExamResultApplication } from "./exam/composition/read-result.js";
import { readTodayDailyCourseApplication } from "./learner-daily/composition/read-today-daily-course.js";
import { readVisibleDaysApplication } from "./trainer-days/composition/read-visible-days.js";
import { readTrainerExamMetadataApplication } from "./trainer-exam/composition/read-trainer-exam-metadata.js";
import { readTrainerNotesSummaryApplication } from "./trainer-notes/composition/read-notes-summary.js";
import { readVisibleStepsApplication } from "./trainer-steps/composition/read-visible-steps.js";
import { readPublicTemplatesApplication } from "./trainer-templates/composition/read-public-templates.js";
import { readTrainingDaysApplication } from "./training/composition/read-training-days.js";
import { readPublicProfileApplication } from "./user/composition/read-public-profile.js";

beforeEach(() => {
  vi.clearAllMocks();
  m.spans.length = 0;
  m.order.length = 0;
});

describe("extra critical read span coverage", () => {
  it("emits twelve fixed stages across ten modules, keeping actor scope and response lifecycle", async () => {
    const actor = "PRIVATE_USER_ID";
    m.catalog.mockImplementationOnce(async () => { m.order.push("catalog"); return []; });
    m.eligibility.mockImplementationOnce(async () => {
      m.order.push("eligibility");
      return { canBook: false, reason: "ACTIVE_BOOKING", nextBookingAt: null, message: "denied" };
    });
    const consultation = await listCynologistsApplication.execute({
      actorUserId: actor, onCatalogLoaded: () => m.order.push("headers"),
    });
    expect(m.order).toEqual(["catalog", "headers", "eligibility"]);
    expect(consultation.bookingEligibility.canBook).toBe(false);
    expect(m.eligibility).toHaveBeenCalledExactlyOnceWith(actor);

    await readExamResultApplication.execute({ actorUserId: actor, userStepId: "PRIVATE_STEP" });
    await readTodayDailyCourseApplication.execute(actor);
    await readVisibleDaysApplication.execute({ actorUserId: actor, elevated: false });
    await readTrainerExamMetadataApplication.summary({ actorUserId: actor, isAdmin: false });
    await readTrainerExamMetadataApplication.pendingSummary({ actorUserId: actor, isAdmin: false });
    await readTrainerNotesSummaryApplication.execute({ actorUserId: actor, isAdmin: false, page: 1, pageSize: 10 });
    await readVisibleStepsApplication.execute({ actorUserId: actor, allowMixed: false, isDailyCourse: false });
    await readPublicTemplatesApplication.execute({ categoryId: undefined });
    await readTrainingDaysApplication.execute({ actorUserId: actor, courseType: "GENERAL" });
    await readPublicProfileApplication.execute("PUBLIC_USERNAME");

    expect(m.spans).toEqual([
      "consultations.cynologists.catalog.read", "consultations.booking.eligibility.read",
      "exam.learner.result.read", "learner.daily.today.read", "trainer.days.visible.read",
      "trainer.exam.results.read", "trainer.exam.pending.read", "trainer.notes.summary.read",
      "trainer.steps.visible.read", "trainer.templates.public.read", "training.days.list.read",
      "user.public_profile.read",
    ]);
    expect(m.spans.join(" ")).not.toMatch(/PRIVATE_USER_ID|PRIVATE_STEP|PUBLIC_USERNAME/);
    expect(m.notes).toHaveBeenCalledWith({ trainerId: actor }, 1, 10);
    expect(m.examResult).toHaveBeenCalledWith(actor, "PRIVATE_STEP");
    expect(m.publicProfile).toHaveBeenCalledWith("PUBLIC_USERNAME", profileRows);
  });

  it("propagates provider errors rather than turning a private exam failure into a public success", async () => {
    const failure = new Error("DATABASE_NOT_AVAILABLE");
    m.examResult.mockRejectedValueOnce(failure);
    await expect(readExamResultApplication.execute({ actorUserId: "owner", userStepId: "step" }))
      .rejects.toBe(failure);
    expect(m.spans).toEqual(["exam.learner.result.read"]);
  });
});
