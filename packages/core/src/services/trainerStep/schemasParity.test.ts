import { describe, expect, it } from "vitest";
import { createStepSchema, updateStepSchema } from "./schemas";

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Шаг для теста",
  description: "Описание шага с нужной длиной",
  type: "THEORY",
  durationSec: null,
  estimatedDurationSec: null,
  imageUrls: [],
  pdfUrls: [],
  requiresVideoReport: false,
  requiresWrittenFeedback: false,
  hasTestQuestions: false,
  surveySlug: null,
};

describe("create/update step domain parity", () => {
  for (const [operation, schema] of [
    ["create", createStepSchema],
    ["update", updateStepSchema],
  ] as const) {
    it(`${operation}: requires a mechanism for an examination`, () => {
      const r = schema.safeParse({ ...base, type: "EXAMINATION" });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) =>
          i.message.includes("хотя бы один тип экзамена"))).toBe(true);
      }
    });

    it(`${operation}: requires duration for TRAINING and BREAK`, () => {
      expect(schema.safeParse({ ...base, type: "TRAINING" }).success).toBe(false);
      expect(schema.safeParse({ ...base, type: "BREAK" }).success).toBe(false);
      expect(schema.safeParse({ ...base, type: "TRAINING", durationSec: 60 }).success).toBe(true);
    });

    it(`${operation}: rejects unknown survey templates`, () => {
      expect(schema.safeParse({ ...base, type: "SURVEY", surveySlug: "unknown" }).success).toBe(false);
    });

    it(`${operation}: accepts a valid examination`, () => {
      expect(schema.safeParse({ ...base, type: "EXAMINATION", requiresWrittenFeedback: true }).success).toBe(true);
    });
  }
});
