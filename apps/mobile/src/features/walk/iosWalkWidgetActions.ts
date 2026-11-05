import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { Pedometer } from "expo-sensors";
import * as Notifications from "expo-notifications";
import { requireNativeModule, type NativeModule } from "expo";
import { Platform } from "react-native";
import { reportClientError } from "@/shared/lib/tracer";
import { useAuthStore } from "@/shared/stores/authStore";
import {
  finishWalk,
  isWalkRunning,
  pauseWalk,
  resumeWalk,
  startWalk,
  type DogWalk,
} from "./walkModel";
import { loadWalkJournal, saveWalkJournal } from "./walkStorage";
import { gpsWalkMeters } from "./walkGpsStorage";
import { startWalkGps, stopWalkGps } from "./walkGpsTask";
import { publishWalkWidgetSnapshot } from "./walkWidgetSnapshot";
import { WALK_WIDGET_OWNER_KEY, type WidgetWalkAction } from "./androidWalkWidgetActions";
import { syncDogWalkHistory, reportWalkSyncIssue } from "./walkSync";
import { syncWalkNotifications } from "./walkNotifications";

interface PendingWalkCommand {
  ownerId: string;
  id: string;
  action: WidgetWalkAction;
  timestamp: number;
}
interface WalkWidgetNativeBridge extends NativeModule {
  pendingDogWalkCommands(): PendingWalkCommand[];
  setVerifiedDogWalkWidgetOwner(ownerId: string | null): void;
  ackDogWalkCommand(commandId: string): void;
}
let serial: Promise<void> = Promise.resolve();
function bridge(): WalkWidgetNativeBridge {
  return requireNativeModule<WalkWidgetNativeBridge>("ExpoWidgets");
}
export function setVerifiedIosWalkWidgetOwner(ownerId: string | null): void {
  if (Platform.OS === "ios") bridge().setVerifiedDogWalkWidgetOwner(ownerId);
}

async function finishIosStepSegment(walk: DogWalk, now: number): Promise<DogWalk> {
  if (!isWalkRunning(walk)) return walk;
  try {
    const count = await Pedometer.getStepCountAsync(
      new Date(walk.runningSinceMs ?? walk.startedAtMs),
      new Date(now),
    );
    return {
      ...walk,
      steps: Math.max(walk.steps, (walk.stepBaselineAtResume ?? 0) + Math.floor(count.steps)),
    };
  } catch (error) {
    reportClientError(error, { issueKey: "IosWidgetPedometer" });
    return { ...walk, incompleteSteps: true };
  }
}
async function apply(ownerId: string, action: WidgetWalkAction): Promise<void> {
  const journal = await loadWalkJournal(ownerId);
  if ((await AsyncStorage.getItem(WALK_WIDGET_OWNER_KEY)) !== ownerId) return;
  const now = Date.now();
  let active = journal.active;
  if (action === "start") {
    if (active && isWalkRunning(active)) {
      // If iOS restarted our host process, an idempotent tap may restore GPS.
      if (active.clientId && active.gpsEnabled) await startWalkGps(ownerId, active.clientId);
      return;
    }
    if (active) active = { ...resumeWalk(active, now), stepBaselineAtResume: active.steps };
    else {
      const permissions = await Pedometer.getPermissionsAsync().catch(() => null);
      active = {
        ...startWalk(journal.preference.mode, now, journal.preference.countdownMinutes * 60),
        clientId: Crypto.randomUUID(),
        incompleteSteps: !permissions?.granted,
      };
    }
    journal.active = active;
    // Persist the timer first so a terminated AppIntent cannot orphan private GPS.
    await saveWalkJournal(ownerId, journal);
    try {
      if (active.clientId && (await startWalkGps(ownerId, active.clientId)))
        active.gpsEnabled = true;
    } catch (error) {
      reportClientError(error, { issueKey: "IosWidgetGpsStart" });
    }
    journal.active = active;
  } else {
    if (!active || (action === "pause" && !isWalkRunning(active))) return;
    if (active.clientId) {
      try {
        await stopWalkGps(ownerId, active.clientId);
      } catch (error) {
        reportClientError(error, { issueKey: "IosWidgetGpsStop" });
      }
    }
    active = await finishIosStepSegment(active, now);
    if (action === "pause") journal.active = pauseWalk(active, now);
    else {
      let meters: number | null = null;
      if (active.clientId) {
        try {
          meters = await gpsWalkMeters(ownerId, active.clientId);
        } catch (error) {
          reportClientError(error, { issueKey: "IosWidgetGpsMeters" });
        }
      }
      const finished = finishWalk({ ...active, gpsMeters: meters ?? active.gpsMeters }, now);
      journal.active = null;
      journal.completed = [finished, ...journal.completed].slice(0, 2000);
    }
  }
  if ((await AsyncStorage.getItem(WALK_WIDGET_OWNER_KEY)) !== ownerId) return;
  await saveWalkJournal(ownerId, journal);
  await publishWalkWidgetSnapshot(
    journal.active ?? journal.completed[0] ?? null,
    now,
    journal.preference.mode,
  );
  try {
    const granted = (await Notifications.getPermissionsAsync()).granted;
    await syncWalkNotifications(ownerId, journal.active, granted);
  } catch (error) {
    reportClientError(error, { issueKey: "IosWidgetNotification" });
  }
  if (action === "finish") void syncDogWalkHistory(ownerId).catch(reportWalkSyncIssue);
}

/** Persistent App Group queue is drained when app-side JS is available, not by widget-extension JS. */
export function processPendingIosWalkCommands(): Promise<void> {
  if (Platform.OS !== "ios") return Promise.resolve();
  const next = serial
    .catch(() => undefined)
    .then(async () => {
      const currentAuth = useAuthStore.getState();
      if (
        currentAuth.isLoading ||
        !currentAuth.isAuthenticated ||
        !currentAuth.verifiedSessionEpoch ||
        !currentAuth.user?.id
      )
        return;
      const native = bridge();
      const ownerId = await AsyncStorage.getItem(WALK_WIDGET_OWNER_KEY);
      if (ownerId !== currentAuth.user.id) return;
      for (const cmd of native.pendingDogWalkCommands()) {
        if (!cmd || !/^[0-9a-f-]{36}$/i.test(cmd.id)) continue;
        // A stale tap from the previous signed-in user must never start a
        // private walk under the currently signed-in account.
        if (cmd.ownerId !== ownerId) {
          native.ackDogWalkCommand(cmd.id);
          continue;
        }
        if (
          !["start", "pause", "finish"].includes(cmd.action) ||
          !Number.isFinite(cmd.timestamp) ||
          Date.now() - cmd.timestamp > 10 * 60_000 ||
          !ownerId
        ) {
          native.ackDogWalkCommand(cmd.id);
          continue;
        }
        // Never acknowledge failed persistence: the command remains retryable.
        await apply(ownerId, cmd.action);
        native.ackDogWalkCommand(cmd.id);
      }
    });
  serial = next;
  return next;
}
