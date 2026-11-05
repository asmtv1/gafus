import { useEffect, useRef } from "react";
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from "expo-screen-capture";

import { canCaptureAppScreen } from "@/shared/lib/security/screenCapturePolicy";
import { reportClientError } from "@/shared/lib/tracer";
import { useAuthStore } from "@/shared/stores/authStore";

const SCREEN_CAPTURE_KEY = "gafus-global-screen-protection";

/**
 * Keep the native screenshot/recording restriction enabled by default. Both
 * platforms can lift it for a verified admin/trainer/partner session without
 * rebuilding their native configuration.
 */
export function useRoleAwareScreenCapture(): void {
  const allowed = useAuthStore((state) => canCaptureAppScreen({
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
    verifiedSessionEpoch: state.verifiedSessionEpoch,
    role: state.user?.role,
  }));
  const pendingChange = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    // Serialize native calls so a slow allow() cannot overtake a subsequent
    // prevent() during logout, session replacement, or role changes.
    pendingChange.current = pendingChange.current
      .then(() => allowed
        ? allowScreenCaptureAsync(SCREEN_CAPTURE_KEY)
        : preventScreenCaptureAsync(SCREEN_CAPTURE_KEY))
      .catch((error: unknown) => {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "ScreenCapturePolicy",
          severity: "warning",
          keys: { operation: allowed ? "allow_privileged" : "prevent_capture" },
        });
      });
  }, [allowed]);
}
