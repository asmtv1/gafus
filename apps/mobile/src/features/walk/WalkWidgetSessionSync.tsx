import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WALK_WIDGET_OWNER_KEY } from "./androidWalkWidgetActions";
import * as Notifications from "expo-notifications";
import { useAuthStore } from "@/shared/stores/authStore";
import { reportClientError } from "@/shared/lib/tracer";
import { loadWalkJournal } from "./walkStorage";
import { publishWalkWidgetSnapshot } from "./walkWidgetSnapshot";
import { syncWalkNotifications } from "./walkNotifications";
import { canUseDogWalkHistory } from "./walkAccess";
import { syncDogWalkHistory, reportWalkSyncIssue } from "./walkSync";
import {
  getAndroidWalkStepSnapshot,
  pauseAnyAndroidWalkSteps,
  reconcileAndroidWalkSteps,
} from "./androidBackgroundSteps";
import { isWalkRunning } from "./walkModel";

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
    const refresh = async () => {
      if (Platform.OS === "android") {
        // Clear access immediately on logout/role loss, before redrawing the card.
        if (ownerId && canUseDogWalkHistory(useAuthStore.getState().user)) {
          await AsyncStorage.setItem(WALK_WIDGET_OWNER_KEY, ownerId);
        } else {
          await AsyncStorage.removeItem(WALK_WIDGET_OWNER_KEY);
        }
      }
      const journal = ownerId ? await loadWalkJournal(ownerId) : null;
      if (cancelled) return;
      if (Platform.OS === "android") {
        try {
          const native = await getAndroidWalkStepSnapshot();
          if (cancelled) return;
          if (
            native?.running &&
            (!ownerId ||
              native.ownerId !== ownerId ||
              !journal?.active ||
              !isWalkRunning(journal.active) ||
              native.walkId !== journal.active.clientId)
          ) {
            // No private walk may continue measuring for a signed-out / different actor.
            await pauseAnyAndroidWalkSteps(native.ownerId);
          } else if (ownerId && journal?.active) {
            // Native SharedPreferences outlives JS/app process eviction. Display the
            // recovered steps immediately; walk screen persists them on next opening.
            journal.active = reconcileAndroidWalkSteps(journal.active, ownerId, native);
          }
        } catch (error) {
          reportClientError(error, { issueKey: "DogWalkNativeSessionRestore" });
        }
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
    };
    const run = () => void refresh().catch((error: unknown) =>
      reportClientError(error, { issueKey: "DogWalkSessionWidgetSync" }),
    );
    run();
    // A session may be started or finished from the launcher while this app is
    // backgrounded. Refresh the local journal and retry remote sync on return.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [ownerId, loading, isAuthenticated, verified]);

  return null;
}
