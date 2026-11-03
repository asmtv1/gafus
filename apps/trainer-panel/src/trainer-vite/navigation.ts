/**
 * Static preview navigation copied from the existing panel menu entry points.
 * Display hints ONLY; NEVER a grant of API permission or frontend auth.
 */
import { previewPageState, type LegacyRoute, type PanelRole } from "./routes";

export interface MockNavItem {
  href: LegacyRoute;
  label: string;
}

export const mockNavigation = [
  { href: "/main-panel", label: "Обзор" },
  { href: "/main-panel/statistics", label: "Общая статистика" },
  { href: "/main-panel/steps", label: "Созданные шаги" },
  { href: "/main-panel/days", label: "Созданные дни" },
  { href: "/main-panel/daily-course", label: "Курс дня" },
  { href: "/main-panel/daily-course/steps", label: "Шаги курса дня" },
  { href: "/main-panel/daily-course/statistics", label: "Статистика курса дня" },
  { href: "/main-panel/daily-course/bundles", label: "Связки курса дня" },
  { href: "/main-panel/daily-course/import", label: "Импорт курса дня" },
  { href: "/main-panel/templates", label: "Библиотека шаблонов" },
  { href: "/main-panel/my-videos", label: "Мои видео" },
  { href: "/main-panel/exam-results", label: "Результаты экзаменов" },
  { href: "/main-panel/articles", label: "Статьи" },
  { href: "/main-panel/notes", label: "Заметки" },
  { href: "/main-panel/consultations", label: "Консультации кинолога" },
 ] as const satisfies readonly MockNavItem[];

/** No navigation when role is denied/unknown or moderator policy is pending. */
export function visibleMockNavigation(pathname: string, role: PanelRole): readonly MockNavItem[] {
  return previewPageState(pathname, role) === "mock-only" ? mockNavigation : [];
}

/** Select the single most specific parent for a dynamic/detail legacy URL. */
export function activeMockHref(pathname: string, role: PanelRole): LegacyRoute | null {
  const items = visibleMockNavigation(pathname, role);
  let selected: LegacyRoute | null = null;
  for (const { href } of items) {
    if (pathname === href || (
      href !== "/main-panel" && pathname.startsWith(href + "/")
    )) {
      if (selected === null || href.length > selected.length) selected = href;
    }
  }
  return selected;
}
