import type { User } from "@/shared/lib/api/auth";

/** Only a server-verified privileged session may capture the app screen. */
export function canCaptureAppScreen(session: {
  isLoading: boolean;
  isAuthenticated: boolean;
  verifiedSessionEpoch: string | null;
  role: User["role"] | null | undefined;
}): boolean {
  if (session.isLoading || !session.isAuthenticated || !session.verifiedSessionEpoch) {
    return false;
  }

  return session.role === "ADMIN" || session.role === "TRAINER" || session.role === "PARTNER";
}
