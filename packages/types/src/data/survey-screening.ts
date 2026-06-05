import type { SurveyAnswerValue } from "./survey";

export const SEPARATION_ANXIETY_SCREENING_SLUG = "separation-anxiety-screening";

const NO_COURSE_NEEDED =
  "У вас уже замечательный хвостик. Судя по ответам, курс вам не нужен.";
const COURSE_OPTIONAL =
  "В целом у вас всё приемлемо. Вы можете пройти курс, чтобы закрепить результат и сделать пребывание питомца в одиночестве ещё комфортнее.";
const COURSE_RECOMMENDED =
  "У питомца есть выраженные признаки тревоги расставания. Этот курс вам обязательно стоит пройти.";

export function getSurveyScreeningResult(
  surveySlug: string,
  answers: Record<string, SurveyAnswerValue>,
): string | null {
  if (surveySlug !== SEPARATION_ANXIETY_SCREENING_SLUG) return null;

  const yesCount = Object.values(answers).filter((answer) => answer === "yes").length;
  if (yesCount === 0) return NO_COURSE_NEEDED;
  if (yesCount <= 3) return COURSE_OPTIONAL;
  return COURSE_RECOMMENDED;
}
