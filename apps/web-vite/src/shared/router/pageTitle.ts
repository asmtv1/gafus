import { articleSlugFromPath, courseIdFromPath, questionIdFromPath, momentIdFromPath, consultationRouteFromPath, consultationCallIdFromPath, type RoutePath } from "./location";

/** Browser-tab orientation for established READ routes only. Never use
 * URL identifiers, usernames, query tokens or server/private content as titles.
 * Opt-in and write/closed routes deliberately retain the neutral base title. */
const BASE_DOCUMENT_TITLE = "Гафус";
const READ_TITLE_SUFFIX = " — Гафус";

export function readPageTitle(path: RoutePath | null, search: string): string {
  if (path === null) return "Страница не найдена" + READ_TITLE_SUFFIX;
  if (path === "/" || path === "/courses") return "Курсы" + READ_TITLE_SUFFIX;
  if (path === "/articles") return "Статьи" + READ_TITLE_SUFFIX;
  if (path === "/subscription") return "Подписка" + READ_TITLE_SUFFIX;
  if (path === "/questions") return "Вопросы" + READ_TITLE_SUFFIX;
  if (path === "/moments") return "Моменты" + READ_TITLE_SUFFIX;
  if (path === "/walks") return "Прогулки" + READ_TITLE_SUFFIX;
  if (consultationRouteFromPath(path) || consultationCallIdFromPath(path))
    return "Консультации с кинологом" + READ_TITLE_SUFFIX;
  if (path === "/profile") {
    // Presence is only used to select a generic label; the value is never
    // included. Unrelated changes to ?cursor/#anchor produce no title write.
    return (
      (new URLSearchParams(search).has("username") ? "Публичный профиль" : "Профиль") +
      READ_TITLE_SUFFIX
    );
  }
  if (courseIdFromPath(path)) return "Курс" + READ_TITLE_SUFFIX;
  if (articleSlugFromPath(path)) return "Статья" + READ_TITLE_SUFFIX;
  if (questionIdFromPath(path)) return "Вопрос" + READ_TITLE_SUFFIX;
  if (momentIdFromPath(path)) return "Момент" + READ_TITLE_SUFFIX;
  return BASE_DOCUMENT_TITLE;
}
