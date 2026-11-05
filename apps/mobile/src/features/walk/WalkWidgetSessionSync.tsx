import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useAuthStore } from "@/shared/stores/authStore";
import { reportClientError } from "@/shared/lib/tracer";
import { loadWalkJournal, saveWalkJournal } from "./walkStorage";
import { publishWalkWidgetSnapshot } from "./walkWidgetSnapshot";
import { syncWalkNotifications } from "./walkNotifications";
import { canUseDogWalkHistory } from "./walkAccess";
import { syncDogWalkHistory, reportWalkSyncIssue } from "./walkSync";

/** Prevent a former account's walk metrics from leaking into home-screen widgets. */
export function WalkWidgetSessionSync() {
  const ownerId = useAuthStore((state) =>
    state.isAuthenticated && !state.isLoading && state.verifiedSessionEpoch
      ? (state.user?.id ?? null)
      : null,
  );
  const loading = useAuthStore((state) => state.isLoading);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const verified = useAuthStore((state) => state.verifiedSessionEpoch);

  useEffect(() => {
    if (loading || (isAuthenticated && !verified)) return;
    let cancelled = false;
    void (async () => {
      const journal = ownerId ? await loadWalkJournal(ownerId) : null;
      if (cancelled) return;
      if (journal?.active && Platform.OS === "android" && !journal.active.incompleteSteps) {
        // A process restart cannot recreate the missed Android background steps.
        journal.active = { ...journal.active, incompleteSteps: true };
        await saveWalkJournal(ownerId!, journal);
      }
      if (!cancelled) {
        await publishWalkWidgetSnapshot(
          journal?.active ?? journal?.completed[0] ?? null,
          Date.now(),
          journal?.preference.mode ?? "stopwatch",
        );
        if (!cancelled) {
          const permission = ownerId ? await Notifications.getPermissionsAsync() : null;
          if (!cancelled) {
            await syncWalkNotifications(
              ownerId,
              journal?.active ?? null,
              permission?.granted === true,
            );
          }
          if (!cancelled && ownerId && canUseDogWalkHistory(useAuthStore.getState().user)) {
            void syncDogWalkHistory(ownerId).catch(reportWalkSyncIssue);
          }
        }
      }
    })().catch((error: unknown) =>
      reportClientError(error, { issueKey: "DogWalkSessionWidgetSync" }),
    );
    return () => {
      cancelled = true;
    };
  }, [ownerId, loading, isAuthenticated, verified]);

  return null;
}
