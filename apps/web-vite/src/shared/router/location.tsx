import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";

export const ROUTES = [
  "/",
  "/courses",
  "/profile",
  "/pets",
  "/articles",
  "/questions",
  "/passwordReset",
  "/reset-password",
  "/subscription",
  "/vk-consent",
  "/questions/new",
  "/moments",
  "/moments/saved",
  "/moments/new",
  "/moments/drafts",
  // WEB033 owner Gallery list: registered read-only GETs in the App shell.
  "/profile/albums",
  "/reminders",
  "/walks",
  "/cynologist-chat",
  "/chats",
  "/profile/delete-account",
  "/profile/change-email",
  "/profile/confirm-email",
  "/profile/set-password",
  "/profile/change-password",
  "/profile/change-username",
  // WEB-URL-005: recognized for opt-in harness only; App defaults to 404.
  "/achievements",
] as const;
export type RoutePath =
  | (typeof ROUTES)[number]
  | "/login"
  | "/register"
  | "/favorites"
  | "/profile/editBio"
  | "/profile/addPet"
  | "/otmazki"
  | "/gafus"
  | "/gafus/guides"
  | "/partner"
  | "/feed/hidden-authors"
  | "/feed/notifications"
  | `/pets/${string}`
  | `/articles/${string}`
  | `/courses/${string}`
  | `/questions/${string}`
  | `/moments/${string}`
  | `/trainings/${string}`
  | `/daily-course/${string}`
  | `/consultations${string}`
  | `/cynologist-chats/${string}`
  | `/chats/${string}`;
/** Historic notification target for an assigned trainer's private dialog.
 * The Hono GET /cynologist-chat?chatId=... is the access decision. */
export function chatDialogIdFromPath(path: string): string | null {
  const result = /^\/cynologist-chats\/([A-Za-z0-9_-]{1,128})$/.exec(path);
  return result?.[1] ?? null;
}
export function chatDialogPath(id: string): RoutePath {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw Error("Invalid chat dialog ID");
  return `/cynologist-chats/${id}`;
}

const PET_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const COURSE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const QUESTION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export function momentProfilePath(username: string): RoutePath {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(username)) {
    throw new Error("Invalid moment profile username");
  }
  return `/moments/profile/${username}`;
}

export function momentProfileUsernameFromPath(path: string): string | null {
  if (!path.startsWith("/moments/profile/")) return null;
  const value = path.slice("/moments/profile/".length);
  return /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}

export function momentDraftPath(id: string): RoutePath {
  if (!QUESTION_ID_PATTERN.test(id) || id === "." || id === "..") {
    throw new Error("Invalid draft ID");
  }
  return `/moments/drafts/${id}`;
}

export function momentDraftIdFromPath(path: string): string | null {
  if (!path.startsWith("/moments/drafts/")) return null;
  const id = path.slice("/moments/drafts/".length);
  return QUESTION_ID_PATTERN.test(id) && id !== "." && id !== ".." ? id : null;
}

export function momentPath(id: string): RoutePath {
  if (!QUESTION_ID_PATTERN.test(id) || id === "." || id === ".." || id === "profile") {
    throw new Error("Invalid moment ID");
  }
  return `/moments/${id}`;
}

/** Only a single validated comment focus ID can extend a Moments post route. */
/** Exact Next edit query, including pending draft recovery and published revisions. */
export function legacyMomentEditId(search: string): string | null | undefined {
  if (!search.startsWith("?")) return undefined;
  const entries = [...new URLSearchParams(search).entries()];
  if (!entries.some(([key]) => key === "edit")) return undefined;
  if (entries.length !== 1 || entries[0]?.[0] !== "edit") return null;
  const id = entries[0][1];
  return QUESTION_ID_PATTERN.test(id) ? id : null;
}

export function legacyMomentEditPath(id: string): RoutePath {
  if (!QUESTION_ID_PATTERN.test(id)) throw Error("Invalid moment edit ID");
  return `/feed/create?edit=${id}` as RoutePath;
}

export function momentCommentPath(postId: string, commentId: string): RoutePath {
  const base = momentPath(postId);
  if (!QUESTION_ID_PATTERN.test(commentId)) throw Error("Invalid moment comment ID");
  return `${base}?commentId=${encodeURIComponent(commentId)}` as RoutePath;
}

export function momentIdFromPath(path: string): string | null {
  if (!path.startsWith("/moments/")) return null;
  const id = path.slice("/moments/".length);
  return QUESTION_ID_PATTERN.test(id) &&
    id !== "." &&
    id !== ".." &&
    id !== "saved" &&
    id !== "new" &&
    id !== "drafts" &&
    id !== "profile"
    ? id
    : null;
}

export function questionPath(id: string): RoutePath {
  if (!QUESTION_ID_PATTERN.test(id) || id === "." || id === "..") {
    throw new Error("Invalid question ID");
  }
  return `/questions/${id}`;
}

export function questionIdFromPath(path: string): string | null {
  if (!path.startsWith("/questions/")) return null;
  const id = path.slice("/questions/".length);
  return QUESTION_ID_PATTERN.test(id) && id !== "." && id !== ".." && id !== "new" ? id : null;
}

/** Direct legacy /questions/[id]/edit, never a nested wildcard match. */
export function questionEditPath(id: string): RoutePath {
  if (!QUESTION_ID_PATTERN.test(id) || id === "new") {
    throw new Error("Invalid question edit ID");
  }
  return ("/questions/" + id + "/edit") as RoutePath;
}

export function questionEditIdFromPath(path: string): string | null {
  const match = /^\/questions\/([A-Za-z0-9_-]{1,128})\/edit$/.exec(path);
  return match && match[1] !== "new" ? match[1] : null;
}

export function coursePath(id: string): RoutePath {
  if (!COURSE_ID_PATTERN.test(id) || id === "." || id === "..") {
    throw new Error("Invalid course ID");
  }
  return `/courses/${id}`;
}

export function courseIdFromPath(path: string): string | null {
  if (!path.startsWith("/courses/")) return null;
  const id = path.slice("/courses/".length);
  return COURSE_ID_PATTERN.test(id) && id !== "." && id !== ".." ? id : null;
}
const ARTICLE_SLUG_PATTERN = /^[\p{L}\p{N}_-]{1,120}$/u;

export function articlePath(slug: string): RoutePath {
  if (!ARTICLE_SLUG_PATTERN.test(slug)) throw new Error("Invalid article slug");
  return ("/articles/" + encodeURIComponent(slug)) as RoutePath;
}

export function articleSlugFromPath(path: string): string | null {
  if (!path.startsWith("/articles/")) return null;
  try {
    const slug = decodeURIComponent(path.slice("/articles/".length));
    return ARTICLE_SLUG_PATTERN.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

export function petPath(id: string): RoutePath {
  if (!PET_ID_PATTERN.test(id) || id === "." || id === "..") {
    throw new Error("Invalid pet ID");
  }
  return `/pets/${id}`;
}

/** Consultations are source-only. A route is never permission to
 * load a trainer/slot: the authoritative catalog and slots gate both.
 * Avoid broad /consultations prefix matching (e.g. admin endpoints). */
const CONSULT_PART = /^[A-Za-z0-9_-]{1,128}$/;
export type ConsultationRouteView = {
  kind: "list" | "mine" | "trainer" | "slots" | "booking";
  trainerId?: string;
  slotId?: string;
};
export function consultationPath(view: ConsultationRouteView): RoutePath {
  if (view.kind === "list") return "/consultations";
  if (view.kind === "mine") return "/consultations/mine";
  if (!view.trainerId || !CONSULT_PART.test(view.trainerId)) throw Error("Invalid trainer ID");
  const base = "/consultations/cynologists/" + view.trainerId;
  if (view.kind === "trainer") return base as RoutePath;
  if (view.kind === "slots") return (base + "/slots") as RoutePath;
  if (view.kind === "booking" && view.slotId && CONSULT_PART.test(view.slotId))
    return (base + "/slots/" + view.slotId) as RoutePath;
  throw Error("Invalid consultation route");
}
/** Existing Next route /consultations/:cynologistUserId is a slot
 * picker, not the specialist-profile page. Keep the separate source-only
 * /consultations/cynologists/:id profile as an additive opt-in screen. */
export function consultationLegacySlotsPath(trainerId: string): RoutePath {
  if (!CONSULT_PART.test(trainerId)) throw Error("Invalid trainer ID");
  return ("/consultations/" + trainerId) as RoutePath;
}
export function consultationLegacyConfirmPath(trainerId: string): RoutePath {
  if (!CONSULT_PART.test(trainerId)) throw Error("Invalid trainer ID");
  return ("/consultations/" + trainerId + "/confirm") as RoutePath;
}
export function consultationRouteFromPath(path: string): ConsultationRouteView | null {
  if (path === "/consultations") return { kind: "list" };
  if (path === "/consultations/mine" || path === "/consultations/my") return { kind: "mine" };
  // /consultations/call and /consultations/cynologists reserved,
  // never interpret them as a trainer user ID.
  const legacy = /^\/consultations\/([A-Za-z0-9_-]{1,128})(?:\/(confirm))?$/.exec(path);
  if (legacy && !["call", "cynologists", "admin", "trainer", "my"].includes(legacy[1]))
    return { kind: legacy[2] ? "booking" : "slots", trainerId: legacy[1] };
  const match = new RegExp(
    "^/consultations/cynologists/" +
      "([A-Za-z0-9_-]{1,128})(?:/slots(?:/([A-Za-z0-9_-]{1,128}))?)?$",
  ).exec(path);
  if (!match) return null;
  if (match[2]) return { kind: "booking", trainerId: match[1], slotId: match[2] };
  return { kind: path.endsWith("/slots") ? "slots" : "trainer", trainerId: match[1] };
}

/** Client deep-link to a call. The Hono admission API makes the final owner/time decision. */
export function consultationCallIdFromPath(path: string): string | null {
  const m = /^\/consultations\/call\/([A-Za-z0-9_-]{1,128})$/.exec(path);
  return m ? m[1] : null;
}

/** Opt-in-only legacy training and daily deep links. IDs are not numbers:
 * day is the exact dayOnCourseId, daily path is scheduleId (not date). */
const TRAINING_PART = /^[A-Za-z0-9_-]{1,128}$/;
export function trainingCoursePath(type: string): RoutePath {
  if (!TRAINING_PART.test(type) || type === "reviews") throw Error("Invalid training type");
  return ("/trainings/" + type) as RoutePath;
}
/** Reserved legacy reviews URL; not a training day ID. */
export function trainingReviewsPath(type: string): RoutePath {
  if (!TRAINING_PART.test(type) || type === "reviews")
    throw Error("Invalid training review course");
  return ("/trainings/" + type + "/reviews") as RoutePath;
}
export function trainingReviewsTypeFromPath(path: string): string | null {
  const match = /^\/trainings\/([A-Za-z0-9_-]{1,128})\/reviews$/.exec(path);
  return match && match[1] !== "reviews" ? match[1] : null;
}
export function trainingDayPath(type: string, dayId: string): RoutePath {
  if (
    !TRAINING_PART.test(type) ||
    !TRAINING_PART.test(dayId) ||
    type === "reviews" ||
    dayId === "reviews"
  )
    throw Error("Invalid training day");
  return ("/trainings/" + type + "/" + dayId) as RoutePath;
}
export function trainingRouteFromPath(path: string): {
  courseType: string;
  dayId: string | null;
} | null {
  const match = /^\/trainings\/([A-Za-z0-9_-]{1,128})(?:\/([A-Za-z0-9_-]{1,128}))?$/.exec(path);
  if (!match || match[1] === "reviews" || match[2] === "reviews") return null;
  return { courseType: match[1], dayId: match[2] ?? null };
}
export function dailyCoursePath(scheduleId: string): RoutePath {
  if (!TRAINING_PART.test(scheduleId)) throw Error("Invalid daily schedule");
  return ("/daily-course/" + scheduleId) as RoutePath;
}
export function dailyScheduleIdFromPath(path: string): string | null {
  const match = /^\/daily-course\/([A-Za-z0-9_-]{1,128})$/.exec(path);
  return match ? match[1] : null;
}

/** Owner-only legacy Gallery album deep link. */
export function galleryAlbumPath(albumId: string): RoutePath {
  if (!PET_ID_PATTERN.test(albumId) || albumId === "." || albumId === "..")
    throw Error("Invalid gallery album ID");
  return ("/profile/albums/" + albumId) as RoutePath;
}
export function galleryAlbumIdFromPath(path: string): string | null {
  const match = /^\/profile\/albums\/([A-Za-z0-9_-]{1,128})$/.exec(path);
  return match ? match[1] : null;
}

/** Exact legacy owner-only medical visit link; NOT the visit records DTO. */
export function petVetVisitsPath(id: string): RoutePath {
  if (!PET_ID_PATTERN.test(id) || id === "." || id === "..") {
    throw new Error("Invalid pet ID");
  }
  return ("/pets/" + id + "/vet-visits") as RoutePath;
}

export function petVetVisitsIdFromPath(path: string): string | null {
  const match = /^\/pets\/([A-Za-z0-9_-]{1,128})\/vet-visits$/.exec(path);
  return match ? match[1] : null;
}

const NAVIGATE_EVENT = "gafus:route-change";

export function normalizedPathname(path: string): string {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("?") ||
    path.includes("#")
  ) {
    return "/not-found";
  }
  return path === "/" ? "/" : path.replace(/\/+$/, "");
}

export function routeForPath(path: string): RoutePath | null {
  const pathname = normalizedPathname(path);
  const exact = ROUTES.find((route) => route === pathname);
  if (exact) return exact;
  // Preserve old bookmarks without introducing a second router or silently
  // redirecting canonical/SEO URLs before the AG4 hosting decision.
  if (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/favorites" ||
    pathname === "/otmazki" ||
    pathname === "/profile/editBio" ||
    pathname === "/profile/addPet" ||
    pathname === "/gafus" ||
    pathname === "/gafus/guides" ||
    pathname === "/partner"
  )
    return pathname;
  // Retained Next has /trainings/[courseType] but no /trainings index.
  // Use the exact source-styled course catalog as a safe parent landing.
  if (pathname === "/trainings") return "/courses";
  if (pathname === "/feed") return "/moments";
  if (pathname === "/feed/create") return "/moments/new";
  if (pathname === "/feed/saved") return "/moments/saved";
  // No equivalent UI exists yet. Do not treat a reserved page as a post ID.
  if (pathname === "/feed/hidden-authors" || pathname === "/feed/notifications") return pathname;
  if (pathname.startsWith("/feed/profile/")) {
    const candidate = "/moments" + pathname.slice("/feed".length);
    return momentProfileUsernameFromPath(candidate) ? (candidate as RoutePath) : null;
  }
  if (pathname.startsWith("/feed/")) {
    const candidate = "/moments" + pathname.slice("/feed".length);
    return momentIdFromPath(candidate) &&
      !["hidden-authors", "notifications", "profile", "create"].includes(
        candidate.slice("/moments/".length),
      )
      ? (candidate as RoutePath)
      : null;
  }
  if (/^\/chats\/[A-Za-z0-9_-]{1,128}$/.test(pathname)) return pathname as RoutePath;
  if (chatDialogIdFromPath(pathname)) return pathname as RoutePath;
  if (consultationRouteFromPath(pathname) || consultationCallIdFromPath(pathname))
    return pathname as RoutePath;
  if (
    trainingRouteFromPath(pathname) ||
    trainingReviewsTypeFromPath(pathname) ||
    dailyScheduleIdFromPath(pathname)
  )
    return pathname as RoutePath;
  if (galleryAlbumIdFromPath(pathname)) return pathname as RoutePath;
  if (petVetVisitsIdFromPath(pathname)) return pathname as RoutePath;
  if (pathname.startsWith("/pets/")) {
    const petId = pathname.slice("/pets/".length);
    if (PET_ID_PATTERN.test(petId) && petId !== "." && petId !== "..") {
      return pathname as RoutePath;
    }
  }
  if (
    articleSlugFromPath(pathname) ||
    courseIdFromPath(pathname) ||
    questionIdFromPath(pathname) ||
    questionEditIdFromPath(pathname) ||
    momentIdFromPath(pathname) ||
    momentDraftIdFromPath(pathname) ||
    momentProfileUsernameFromPath(pathname)
  ) {
    return pathname as RoutePath;
  }
  return null;
}

function currentPathname(): string {
  return window.location.pathname;
}

function watchLocation(handler: () => void): () => void {
  window.addEventListener("popstate", handler);
  window.addEventListener(NAVIGATE_EVENT, handler);
  return () => {
    window.removeEventListener("popstate", handler);
    window.removeEventListener(NAVIGATE_EVENT, handler);
  };
}

export function useRoutePath(): RoutePath | null {
  const pathname = useSyncExternalStore(watchLocation, currentPathname, () => "/");
  return routeForPath(pathname);
}

/** Query changes also matter for deep links on the same pathname. */
export function useRouteSearch(): string {
  return useSyncExternalStore(
    watchLocation,
    () => window.location.search,
    () => "",
  );
}

export function navigate(path: RoutePath): void {
  // TypeScript template routes are not a runtime trust boundary. Deny
  // malformed, external or unregistered destinations before pushState.
  // routeForPath deliberately validates only pathnames. Deep-linked comment
  // focus is an explicit, sole query exception; arbitrary query keys, hash,
  // encoded delimiters, unregistered routes, and external URLs stay denied.
  const commentLink = /^(\/moments\/[A-Za-z0-9_-]{1,128})\?commentId=([A-Za-z0-9_-]{1,128})$/.exec(
    path,
  );
  const commentRoute = commentLink?.[1];
  const allowedComment =
    commentRoute && momentIdFromPath(commentRoute) && routeForPath(commentRoute) === commentRoute;
  const editLink = /^\/(?:feed\/create|moments\/new)\?edit=([A-Za-z0-9_-]{1,128})$/.exec(path);
  const allowedEdit = !!editLink && !!legacyMomentEditId("?edit=" + editLink[1]);
  // Explicit, single-parameter chat compose deep-link; no arbitrary query injection.
  const composeLink = /^\/chats\?to=([A-Za-z0-9_-]{2,128})$/.exec(path);
  const allowedChatCompose = !!composeLink;
  if (!routeForPath(path) && !allowedComment && !allowedEdit && !allowedChatCompose) {
    throw new Error("Invalid route");
  }
  if (window.location.pathname + window.location.search === path && window.location.hash === "")
    return;
  // Mark only entries created by our own SPA transitions. Cancel may go
  // back to these entries; direct/external visits use a safe fallback.
  window.history.pushState({ __gafusSpaNavigation: true }, "", path);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

/** Return to the actual previous SPA page, preserving its URL and history.
 * Never blindly history.back() from a direct visit: that might exit GAFUS. */
export function cancelToPreviousPage(fallback: RoutePath): void {
  if (window.history.state?.__gafusSpaNavigation === true && window.history.length > 1) {
    window.history.back();
    return;
  }
  navigate(fallback);
}

/**
 * A real same-origin anchor: works with copy/paste and middle-click.
 * Intercepts ONLY a normal unmodified left click for SPA transitions.
 */
export function RouteLink({
  to,
  children,
  className,
  current,
  "aria-label": accessibleLabel,
  "data-gafus-shared-button": sharedButton,
}: {
  to: RoutePath;
  children: ReactNode;
  className?: string;
  current?: boolean;
  "aria-label"?: string;
  "data-gafus-shared-button"?: "back";
}) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    navigate(to);
  }

  return (
    <a
      href={to}
      className={className}
      data-gafus-shared-button={sharedButton}
      aria-label={accessibleLabel}
      aria-current={current ? "page" : undefined}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
