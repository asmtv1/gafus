import { beforeEach, describe, expect, it, vi } from "vitest";

import { getVisibleSteps, updateStep, deleteSteps, removeStepImageUrl } from "./trainerStepService";

const mocks = vi.hoisted(() => ({
  stepFindMany: vi.fn(),
  stepUpdate: vi.fn(),
  stepDeleteMany: vi.fn(),
  stepFindUnique: vi.fn(),
  invalidateSteps: vi.fn(),
  publishRevision: vi.fn(async () => undefined),
}));

vi.mock("../training/trainingDayContent", () => ({
  invalidateStepsContentCache: mocks.invalidateSteps,
}));
vi.mock("../training/trainingContentRevision", () => ({
  publishCourseContentChange: mocks.publishRevision,
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    step: {
      findMany: (...args: unknown[]) => mocks.stepFindMany(...args),
      update: (...args: unknown[]) => mocks.stepUpdate(...args),
      deleteMany: (...args: unknown[]) => mocks.stepDeleteMany(...args),
      findUnique: (...args: unknown[]) => mocks.stepFindUnique(...args),
    },
  },
  Prisma: {
    JsonNull: null,
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("trainerStepService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only lists non-daily-course steps for regular training day creation", async () => {
    mocks.stepFindMany.mockResolvedValue([]);

    await getVisibleSteps("trainer-1", false);

    expect(mocks.stepFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          authorId: "trainer-1",
          isDailyCourse: false,
        },
      }),
    );
  });

  it("lists only daily-course steps when requested", async () => {
    mocks.stepFindMany.mockResolvedValue([]);

    await getVisibleSteps("trainer-1", false, { isDailyCourse: true });

    expect(mocks.stepFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          authorId: "trainer-1",
          isDailyCourse: true,
        },
      }),
    );
  });
});

describe("step content invalidation after trainer mutations", () => {
  const validStep = {
    id: "step-1",
    title: "Lesson",
    description: "Detailed lesson text",
    durationSec: 60,
    estimatedDurationSec: null,
    type: "TRAINING" as const,
    videoUrl: null,
    imageUrls: [] as string[],
    pdfUrls: [] as string[],
    checklist: null,
    requiresVideoReport: false,
    requiresWrittenFeedback: false,
    hasTestQuestions: false,
    surveySlug: null,
    isDailyCourse: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stepUpdate.mockResolvedValue({ id: "step-1" });
    mocks.stepDeleteMany.mockResolvedValue({ count: 1 });
    mocks.stepFindMany.mockResolvedValue([{ id: "step-1", imageUrls: [] }]);
  });

  it("invalidates an edited step only after a successful write", async () => {
    const result = await updateStep(validStep);

    expect(result.success).toBe(true);
    expect(mocks.invalidateSteps).toHaveBeenCalledExactlyOnceWith(["step-1"]);
    expect(mocks.publishRevision).toHaveBeenCalledTimes(1);
  });

  it("does not invalidate when editing a step fails", async () => {
    mocks.stepUpdate.mockRejectedValue(new Error("db down"));

    const result = await updateStep(validStep);

    expect(result.success).toBe(false);
    expect(mocks.invalidateSteps).not.toHaveBeenCalled();
    expect(mocks.publishRevision).not.toHaveBeenCalled();
  });

  it("invalidates deleted steps after the delete succeeds", async () => {
    const result = await deleteSteps({ stepIds: ["step-1"] });

    expect(result.success).toBe(true);
    expect(mocks.invalidateSteps).toHaveBeenCalledExactlyOnceWith(["step-1"]);
    expect(mocks.publishRevision).toHaveBeenCalledTimes(1);
  });

  it("does not invalidate if deleting a step fails", async () => {
    mocks.stepDeleteMany.mockRejectedValue(new Error("db down"));

    const result = await deleteSteps({ stepIds: ["step-1"] });

    expect(result.success).toBe(false);
    expect(mocks.invalidateSteps).not.toHaveBeenCalled();
    expect(mocks.publishRevision).not.toHaveBeenCalled();
  });

  it("invalidates a step when its referenced image is removed", async () => {
    mocks.stepFindUnique.mockResolvedValue({ imageUrls: ["a.jpg", "b.jpg"] });

    const result = await removeStepImageUrl("step-1", "a.jpg");

    expect(result.success).toBe(true);
    expect(mocks.stepUpdate).toHaveBeenCalledWith({
      where: { id: "step-1" },
      data: { imageUrls: ["b.jpg"] },
    });
    expect(mocks.invalidateSteps).toHaveBeenCalledExactlyOnceWith(["step-1"]);
    expect(mocks.publishRevision).toHaveBeenCalledTimes(1);
  });

  it("does not invalidate when a requested image was already absent", async () => {
    mocks.stepFindUnique.mockResolvedValue({ imageUrls: ["b.jpg"] });

    const result = await removeStepImageUrl("step-1", "a.jpg");

    expect(result.success).toBe(true);
    expect(mocks.invalidateSteps).not.toHaveBeenCalled();
    expect(mocks.publishRevision).not.toHaveBeenCalled();
  });
});
