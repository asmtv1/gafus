import { galleryAlbumIdFromPath, chatDialogIdFromPath, trainingRouteFromPath, trainingReviewsTypeFromPath, consultationRouteFromPath, consultationCallIdFromPath, type RoutePath } from "./location";

/** Match the original Next middleware: an unauthenticated browser may only
 * visit the landing/auth/recovery pages. Do not fetch private catalog, previews
 * or another user's cached views before /auth/me resolves. An ambiguous auth
 * failure (5xx) is not proof of logout and must not redirect automatically. */
export const NEXT_PUBLIC_WEB_ROUTES = new Set<RoutePath>([
  "/",
  "/login",
  "/register",
  "/passwordReset",
  "/reset-password",
  "/profile/confirm-email",
  "/otmazki",
]);

type ConnectedFlowFlags = {
  showTrainingFlowOptIn?: boolean;
  showConsultationsFlowOptIn?: boolean;
  showVetHonoOptIn?: boolean;
  showNotificationsRouteOptIn?: boolean;
  showWalletRouteOptIn?: boolean;
  showGuidesRouteOptIn?: boolean;
  showPartnerRouteOptIn?: boolean;
};

/** Route classification is independent of React and the session transport. */
export function requiresConnectedSession(currentPath: RoutePath | null, flags: ConnectedFlowFlags = {}): boolean {
  // Preserve the existing App-lifetime private-session fence on owner gallery
  // direct URLs, even without injected feature-test transports.
  const galleryOwnerRoute =
    currentPath !== null &&
    (currentPath === "/profile/albums" || galleryAlbumIdFromPath(currentPath) !== null);
  const notificationOwnerRoute = currentPath === "/feed/notifications";
  const reminderOwnerRoute = currentPath === "/reminders";
  const walksOwnerRoute = currentPath === "/walks";
  const chatOwnerRoute =
    currentPath === "/chats" ||
    /^\/chats\/[A-Za-z0-9_-]{1,128}$/.test(currentPath ?? "") ||
    currentPath === "/cynologist-chat" ||
    chatDialogIdFromPath(currentPath ?? "") !== null;
  const hiddenAuthorsOwnerRoute = currentPath === "/feed/hidden-authors";
  const trainingOwnerRoute =
    currentPath !== null &&
    (trainingRouteFromPath(currentPath) !== null ||
      trainingReviewsTypeFromPath(currentPath) !== null);
  const consultationOwnerRoute =
    currentPath !== null &&
    (consultationRouteFromPath(currentPath) !== null ||
      consultationCallIdFromPath(currentPath) !== null);
  // Gallery opt-in is enabled for the whole production Web entrypoint, but
  // only album routes own the extra gallery session fence. Treating the flag
  // as a global private-route switch caused unrelated /questions, /articles,
  // and /courses pages to inherit the irreversible gallery recovery screen.
  // NextProtectedRouteBoundary still validates /auth/me for every private URL;
  // connected owner flows retain their stricter A→B→A protection below.
  return (
    reminderOwnerRoute ||
    walksOwnerRoute ||
    chatOwnerRoute ||
    trainingOwnerRoute ||
    consultationOwnerRoute ||
    hiddenAuthorsOwnerRoute ||
    notificationOwnerRoute ||
    galleryOwnerRoute ||
    flags.showTrainingFlowOptIn === true ||
    flags.showConsultationsFlowOptIn === true ||
    flags.showVetHonoOptIn === true ||
    flags.showNotificationsRouteOptIn === true ||
    flags.showWalletRouteOptIn === true ||
    flags.showGuidesRouteOptIn === true ||
    flags.showPartnerRouteOptIn === true
  );
}

export function requiresOwnerFence(path: RoutePath | null, flags: ConnectedFlowFlags = {}): boolean {
  return requiresConnectedSession(path, flags) && !(path && NEXT_PUBLIC_WEB_ROUTES.has(path));
}
