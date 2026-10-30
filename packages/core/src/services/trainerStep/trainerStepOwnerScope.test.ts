import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteSteps, getStepForEdit, updateStep } from "./trainerStepService";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(),
  deleteMany: vi.fn(), invalidate: vi.fn(), publish: vi.fn(async () => undefined),
}));
vi.mock("@gafus/prisma", () => ({
  Prisma: { JsonNull: null },
  prisma: {
    step: {
      findUnique: m.findUnique, findMany: m.findMany,
      update: m.update, deleteMany: m.deleteMany,
    },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
      step: { findMany: m.findMany, deleteMany: m.deleteMany },
    }),
  },
}));
vi.mock("../training/trainingDayContent", () => ({
  invalidateStepsContentCache: m.invalidate,
}));
vi.mock("../training/trainingContentRevision", () => ({
  publishCourseContentChange: m.publish,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));
const actor = { id: "trainer-1", role: "TRAINER" as const };
const step = {
  id: "step-1", title: "Сидеть", description: "Описание тренировки сидеть",
  durationSec: 120, estimatedDurationSec: null, type: "TRAINING" as const,
  videoUrl: null, imageUrls: [], pdfUrls: [], checklist: null,
  requiresVideoReport: false, requiresWrittenFeedback: false,
  hasTestQuestions: false, surveySlug: null, isDailyCourse: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  m.update.mockResolvedValue({});
});
describe("Core trainer-step ownership at the mutation boundary", () => {
  it("keeps trainer authorId inside atomic Prisma step update condition", async () => {
    expect((await updateStep(step, actor)).success).toBe(true);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: step.id, authorId: actor.id },
    }));
    expect(m.invalidate).toHaveBeenCalledWith([step.id]);
  });
  it("admin may update any step only with explicit ADMIN actor", async () => {
    await updateStep(step, { id: "admin", role: "ADMIN" });
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: step.id },
    }));
  });
  it("reads edit data constrained to owner before returning private fields", async () => {
    m.findUnique.mockResolvedValue(null);
    expect(await getStepForEdit(step.id, actor)).toBeNull();
    expect(m.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: step.id, authorId: actor.id },
    }));
  });
  it("refuses to delete mixed-owner IDs before invoking any delete", async () => {
    m.findMany.mockResolvedValue([{ id: "own-1", imageUrls: [] }]);
    const result = await deleteSteps({ stepIds: ["own-1", "foreign-2"] }, actor);
    expect(result.success).toBe(false);
    expect(m.deleteMany).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["own-1", "foreign-2"] }, authorId: actor.id },
      select: { id: true, imageUrls: true },
    });
  });
  it("deletes exactly one own step and returns its media for deferred CDN cleanup", async () => {
    m.findMany.mockResolvedValue([{ id: step.id, imageUrls: ["https://example.invalid/a.jpg"] }]);
    m.deleteMany.mockResolvedValue({ count: 1 });
    const result = await deleteSteps({ stepIds: [step.id] }, actor);
    expect(result).toMatchObject({
      success: true, imageUrls: ["https://example.invalid/a.jpg"],
    });
    expect(m.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [step.id] }, authorId: actor.id },
    });
    expect(m.publish).toHaveBeenCalledTimes(1);
  });
});
