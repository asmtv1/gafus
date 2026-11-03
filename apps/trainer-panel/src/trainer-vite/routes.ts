/**
 * Isolated browser-only route preparation; NEVER imported by legacy Next pages.
 * G0 URL parity is only structural; real UI/AG1 contract remains BLOCKED.
 */
export const legacyRoutes = [
  "/main-panel/articles/[id]/edit",
  "/main-panel/articles/new",
  "/main-panel/articles",
  "/main-panel/consultations/availability",
  "/main-panel/consultations/call/[bookingId]",
  "/main-panel/consultations",
  "/main-panel/courses/[id]/edit",
  "/main-panel/courses/new",
  "/main-panel/daily-course/bundles",
  "/main-panel/daily-course/import",
  "/main-panel/daily-course",
  "/main-panel/daily-course/statistics",
  "/main-panel/daily-course/steps",
  "/main-panel/days/[id]/edit",
  "/main-panel/days/new",
  "/main-panel/days",
  "/main-panel/exam-results",
  "/main-panel/my-videos",
  "/main-panel/notes",
  "/main-panel",
  "/main-panel/statistics/courses/[courseId]",
  "/main-panel/statistics",
  "/main-panel/steps/[id]/edit",
  "/main-panel/steps/new",
  "/main-panel/steps",
  "/main-panel/templates",
  "/login",
  "/",
] as const;

export type LegacyRoute = (typeof legacyRoutes)[number];
export type PanelRole = "GUEST" | "USER" | "PARTNER" | "TRAINER" | "MODERATOR" | "ADMIN";
export type MockPageState = "login" | "denied" | "policy-pending" | "mock-only" | "not-found";
const PARAM_SEGMENT = /^\[[A-Za-z][A-Za-z0-9]*\]$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Receives pathname only (query/hash are handled separately by History API). */
export function matchLegacyPath(pathname: string): LegacyRoute | null {
  if (!pathname.startsWith("/") || pathname.startsWith("//") ||
      pathname.includes("?") || pathname.includes("#") ||
      pathname.includes("\\") || pathname.includes("%") ||
      pathname.includes("\0") || pathname.includes("//")) {
    return null;
  }
  const normalized = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  const parts = normalized.split("/");
  for (const route of legacyRoutes) {
    if (route === normalized) return route;
    if (!route.includes("[")) continue;
    const pattern = route.split("/");
    if (parts.length !== pattern.length) continue;
    if (pattern.every((segment, index) =>
      PARAM_SEGMENT.test(segment) ? SAFE_ID.test(parts[index] ?? "") :
        segment === parts[index])) return route;
  }
  return null;
}

/** UX-only mock guard: does not replace Hono RBAC, owner checks or session. */
export function previewPageState(pathname: string, role: PanelRole): MockPageState {
  const route = matchLegacyPath(pathname);
  if (route === null) return "not-found";
  if (route === "/" || route === "/login") return "login";
  if (role === "GUEST") return "login";
  if (role === "USER" || role === "PARTNER") return "denied";
  if (role === "MODERATOR") {
    // Approved staff consultation policy: moderator cannot access bookings/schedules.
    if (route.startsWith("/main-panel/consultations")) return "denied";
    return "policy-pending";
  }
  if (role === "ADMIN") return "policy-pending";
  return role === "TRAINER" ? "mock-only" : "denied";
}
