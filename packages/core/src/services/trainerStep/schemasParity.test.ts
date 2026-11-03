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

describe("ordered video attachments", () => {
  const videos = ["a", "b"].map(item => `https://cdn.example.test/${item}.mp4`);
  for (const [name, schema] of [["create", createStepSchema],
    ["edit", updateStepSchema]] as const) {
    it(`${name} supports ordered unique HTTPS videos and legacy compatibility`, () => {
      expect(schema.safeParse({ ...base, videoUrl: videos[0], videoUrls: videos }).success)
        .toBe(true);
      expect(schema.safeParse({ ...base, videoUrl: videos[0] }).success)
        .toBe(true);
      for (const bad of [
        { videoUrl: videos[1], videoUrls: videos },
        { videoUrl: videos[0], videoUrls: [videos[0], videos[0]] },
        { videoUrl: videos[0], videoUrls: Array(9).fill(videos[0]) },
        { videoUrl: "http://cdn.example.test/a.mp4",
          videoUrls: ["http://cdn.example.test/a.mp4"] },
        { videoUrl: "javascript:alert(1)", videoUrls: ["javascript:alert(1)"] },
      ]) expect(schema.safeParse({ ...base, ...bad }).success).toBe(false);
    });
  }
});

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
