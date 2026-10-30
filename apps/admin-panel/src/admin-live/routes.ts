/** Active Admin Vite routes; legacy short names are not standalone browser URLs. */
export const adminSections = [
  {
    key: "feed-moderation",
    title: "Модерация моментов",
    path: "/main-panel/feed-moderation",
    api: "/api/v1/admin/moderation/feed/reports",
    roles: ["ADMIN", "MODERATOR"],
  },
  {
    key: "questions",
    title: "Вопросы",
    path: "/main-panel/questions",
    api: "/api/v1/admin/moderation/questions/reports",
    roles: ["ADMIN"],
  },
  {
    key: "users",
    title: "Пользователи",
    path: "/main-panel/users",
    api: "/api/v1/admin/users",
    roles: ["ADMIN", "MODERATOR"],
  },
  {
    key: "mail",
    title: "Почта",
    path: "/main-panel/mail",
    api: "/api/v1/admin/mail",
    roles: ["ADMIN"],
  },
  {
    key: "media",
    title: "Медиа и хранение",
    path: "/main-panel/media",
    api: "/api/v1/admin/media/stats",
    roles: ["ADMIN"],
  },
  {
    key: "admin",
    title: "Администрирование",
    path: "/main-panel/admin",
    api: "/api/v1/admin/settings/subscriptions",
    roles: ["ADMIN", "MODERATOR"],
  },
  {
    key: "partners",
    title: "Партнёры",
    path: "/main-panel/partners",
    api: "/api/v1/admin/partners",
    roles: ["ADMIN"],
  },
  {
    key: "profit",
    title: "Прибыль",
    path: "/main-panel/profit",
    api: "/api/v1/admin/profit",
    roles: ["ADMIN"],
  },
  {
    key: "feature-flags",
    title: "Флаги приложения",
    path: "/main-panel/feature-flags",
    api: "/api/v1/admin/feature-flags",
    roles: ["ADMIN", "MODERATOR"],
  },
  {
    key: "broadcasts",
    title: "Рассылки",
    path: "/main-panel/broadcasts",
    api: "/api/v1/admin/broadcasts/preview",
    roles: ["ADMIN"],
  },
  {
    key: "reengagement",
    title: "Возврат пользователей",
    path: "/main-panel/reengagement",
    api: "/api/v1/admin/analytics/reengagement",
    roles: ["ADMIN"],
  },
  {
    key: "rewarded-ads",
    title: "Архив рекламы",
    path: "/main-panel/rewarded-ads",
    api: "/api/v1/admin/analytics/rewarded-ads?days=30",
    roles: ["ADMIN"],
  },
  {
    key: "gafus",
    title: "Гафусы",
    path: "/main-panel/gafus",
    api: "/api/v1/gafus/admin/dashboard",
    roles: ["ADMIN"],
  },
  {
    key: "mobile-intro",
    title: "Первый запуск",
    path: "/main-panel/mobile-intro",
    api: "/api/v1/mobile-intro/admin/report",
    roles: ["ADMIN"],
  },
  {
    key: "app-subscriptions",
    title: "Подписки",
    path: "/main-panel/app-subscriptions",
    api: "/api/v1/admin/app-subscriptions",
    roles: ["ADMIN", "MODERATOR"],
  },
  {
    key: "consultations",
    title: "Консультации с кинологом",
    path: "/main-panel/consultations",
    api: "/api/v1/consultations/admin/cynologists",
    roles: ["ADMIN"],
  },
  {
    key: "bookings",
    title: "Все брони консультаций",
    path: "/main-panel/consultations/bookings",
    api: "/api/v1/consultations/admin/bookings",
    roles: ["ADMIN"],
  },
  {
    key: "trainers-schedules",
    title: "Расписания тренеров",
    path: "/main-panel/consultations/trainers-schedules",
    api: "/api/v1/consultations/admin/cynologists",
    roles: ["ADMIN"],
  },
] as const;
export type AdminSection = (typeof adminSections)[number];
export type AdminRole = "USER" | "PARTNER" | "TRAINER" | "MODERATOR" | "ADMIN";
export function matchAdminRoute(path: string): AdminSection | null {
  if (path === "/main-panel" || path === "/main-panel/") return adminSections[5];
  const clean = path.replace(/\/+$/, "");
  const match = adminSections.find((section) => section.path === clean);
  if (match) return match;
  if (/^\/main-panel\/users\/[a-zA-Z0-9_-]{1,128}\/app-subscription$/.test(clean)) {
    return adminSections.find((section) => section.key === "users") ?? null;
  }
  if (/^\/main-panel\/partners\/[a-zA-Z0-9_-]{1,128}$/.test(clean)) {
    return adminSections.find((section) => section.key === "partners") ?? null;
  }
  return null;
}
export function maySeeRoute(section: AdminSection, role: AdminRole | null): boolean {
  return role !== null && (section.roles as readonly string[]).includes(role);
}
