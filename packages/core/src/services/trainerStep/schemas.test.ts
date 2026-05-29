import { describe, expect, it } from "vitest";

import { createStepSchema } from "./schemas";

describe("createStepSchema", () => {
  it("preserves correct answer index in checklist questions", () => {
    const result = createStepSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Экзаменационный шаг",
      description: "Описание экзаменационного шага",
      type: "EXAMINATION",
      durationSec: null,
      estimatedDurationSec: 600,
      videoUrl: null,
      imageUrls: [],
      pdfUrls: [],
      checklist: [
        {
          id: "q1",
          question: "Какой вариант правильный?",
          options: ["Первый", "Второй"],
          correctAnswer: 1,
        },
      ],
      requiresVideoReport: false,
      requiresWrittenFeedback: false,
      hasTestQuestions: true,
      surveySlug: null,
      isDailyCourse: false,
    });

    expect(result.checklist?.[0]?.correctAnswer).toBe(1);
  });
});
