import { describe, expect, it } from "vitest";

import {
  SEPARATION_ANXIETY_SCREENING_SLUG,
  getSurveyScreeningResult,
} from "./survey-screening";

function answersWithYesCount(count: number): Record<string, "yes" | "no"> {
  return Object.fromEntries(
    Array.from({ length: 11 }, (_, index) => [`question_${index + 1}`, index < count ? "yes" : "no"]),
  );
}

describe("getSurveyScreeningResult", () => {
  it.each([
    [0, "У вас уже замечательный хвостик. Судя по ответам, курс вам не нужен."],
    [
      1,
      "В целом у вас всё приемлемо. Вы можете пройти курс, чтобы закрепить результат и сделать пребывание питомца в одиночестве ещё комфортнее.",
    ],
    [
      3,
      "В целом у вас всё приемлемо. Вы можете пройти курс, чтобы закрепить результат и сделать пребывание питомца в одиночестве ещё комфортнее.",
    ],
    [
      4,
      "У питомца есть выраженные признаки тревоги расставания. Этот курс вам обязательно стоит пройти.",
    ],
    [
      11,
      "У питомца есть выраженные признаки тревоги расставания. Этот курс вам обязательно стоит пройти.",
    ],
  ])("returns the approved recommendation for %i yes answers", (yesCount, expected) => {
    expect(
      getSurveyScreeningResult(SEPARATION_ANXIETY_SCREENING_SLUG, answersWithYesCount(yesCount)),
    ).toBe(expected);
  });

  it("returns null for other survey templates", () => {
    expect(getSurveyScreeningResult("dog-home-alone-initial", answersWithYesCount(11))).toBeNull();
  });
});
