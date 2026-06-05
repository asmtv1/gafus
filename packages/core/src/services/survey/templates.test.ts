import { describe, expect, it } from "vitest";

import { findSurveyTemplate } from "./templates";

describe("separation anxiety screening survey template", () => {
  it("contains 11 required yes/no questions", () => {
    const template = findSurveyTemplate("separation-anxiety-screening");

    expect(template).not.toBeNull();
    expect(template?.sections).toHaveLength(1);
    expect(template?.questions).toHaveLength(11);
    template?.questions.forEach((question) => {
      expect(question).toMatchObject({
        required: true,
        type: "singleChoice",
        options: [
          { value: "yes", label: "Да" },
          { value: "no", label: "Нет" },
        ],
      });
    });
  });
});
