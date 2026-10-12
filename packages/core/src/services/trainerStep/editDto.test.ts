import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindStep = vi.hoisted(() => vi.fn());
vi.mock("@gafus/prisma", () => ({
  prisma: { step: { findUnique: mockFindStep } },
  Prisma: { JsonNull: Symbol.for("JsonNull") },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock("@gafus/core/errors", () => ({ handlePrismaError: vi.fn() }));

import { getStepForEdit } from "./trainerStepService";

const step = {
  id: "step-1",
  title: "Теория",
  description: "Описание теоретического шага",
  durationSec: null,
  estimatedDurationSec: 120,
  videoUrl: null,
  type: "THEORY",
  imageUrls: ["https://cdn.example/img.png"],
  pdfUrls: [],
  checklist: null,
  requiresVideoReport: false,
  requiresWrittenFeedback: false,
  hasTestQuestions: false,
  isDailyCourse: false,
  surveySlug: null,
};

describe("TrainerStepEdit DTO", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null for an unknown step", async () => {
    mockFindStep.mockResolvedValue(null);
    expect(await getStepForEdit("missing")).toBeNull();
  });

  it("returns only form fields and discards invalid legacy checklist JSON", async () => {
    mockFindStep.mockResolvedValue({ ...step, checklist: { invalid: true }, privateColumn: "secret" });
    const result = await getStepForEdit("step-1");
    expect(result).toMatchObject({
      id: "step-1", type: "THEORY", durationSec: undefined, checklist: [], estimatedDurationSec: 120,
    });
    expect(result).not.toHaveProperty("privateColumn");
    expect(mockFindStep).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "step-1" },
      select: expect.objectContaining({ title: true, checklist: true }),
    }));
  });

  it("returns validated checklist entries", async () => {
    mockFindStep.mockResolvedValue({ ...step, checklist: [{
      id: "q1", question: "Какой правильный ответ?",
      options: ["Да", "Нет"], correctAnswer: 0,
    }] });
    const result = await getStepForEdit("step-1");
    expect(result?.checklist).toHaveLength(1);
    expect(result?.checklist[0]?.correctAnswer).toBe(0);
  });
});
