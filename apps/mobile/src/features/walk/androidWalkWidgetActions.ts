import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import { reportClientError } from "@/shared/lib/tracer";
import {
  finishWalk,
  isWalkRunning,
  pauseWalk,
  resumeWalk,
  startWalk,
  type DogWalk,
} from "./walkModel";
import { loadWalkJournal, saveWalkJournal } from "./walkStorage";
import { publishWalkWidgetSnapshot } from "./walkWidgetSnapshot";
import {
  getAndroidWalkStepAvailability,
  getAndroidWalkStepSnapshot,
  pauseAndroidWalkSteps,
  reconcileAndroidWalkSteps,
  startAndroidWalkSteps,
} from "./androidBackgroundSteps";
import { syncWalkNotifications } from "./walkNotifications";
import { syncDogWalkHistory, reportWalkSyncIssue } from "./walkSync";

/**
 * Only the verified and allowed account can bind home-screen controls.
 * Headless Android widget tasks do not mount React auth state.
 */
export const WALK_WIDGET_OWNER_KEY = "gafus:dog-walk:widget:verified-owner:v1";
export type WidgetWalkAction = "start" | "pause" | "finish";

const isAction = (value: unknown): value is WidgetWalkAction =>
  value === "start" || value === "pause" || value === "finish";

let actions: Promise<void> = Promise.resolve();

/** Serialize repeated taps within the same JS runtime and persist before starting the sensor. */
export function handleAndroidWalkWidgetClick(action: unknown): Promise<void> {
  if (!isAction(action)) return Promise.resolve();
  const task = actions.catch(() => undefined).then(() => perform(action));
  actions = task;
  return task;
}

async function perform(action: WidgetWalkAction): Promise<void> {
  const ownerId = await AsyncStorage.getItem(WALK_WIDGET_OWNER_KEY);
  if (!ownerId) return; // The widget must not start private walks after sign-out.
  const journal = await loadWalkJournal(ownerId);
  // If the account changed during the background read, consume without mutation.
  if ((await AsyncStorage.getItem(WALK_WIDGET_OWNER_KEY)) !== ownerId) return;
  const now = Date.now();
  let current: DogWalk | null = journal.active;

  if (current) {
    try {
      const native = await getAndroidWalkStepSnapshot();
      current = reconcileAndroidWalkSteps(current, ownerId, native);
      journal.active = current;
    } catch (error) {
      reportClientError(error, { issueKey: "DogWalkWidgetNativeRead" });
    }
  }

  if (action === "start") {
    if (current && isWalkRunning(current)) return;
    if (current) {
      journal.active = {
        ...resumeWalk(current, now),
        stepBaselineAtResume: current.steps,
      };
    } else {
      let incompleteSteps = false;
      try {
        const sensor = await getAndroidWalkStepAvailability();
        incompleteSteps = sensor !== "counter" && sensor !== "detector";
      } catch {
        incompleteSteps = true;
      }
      journal.active = {
        ...startWalk(
          journal.preference.mode,
          now,
          journal.preference.countdownMinutes * 60,
        ),
        clientId: Crypto.randomUUID(),
        incompleteSteps,
      };
    }
    // Persist first so a killed headless JS task cannot leave an orphan step service.
    await saveWalkJournal(ownerId, journal);
    try {
      const native = await startAndroidWalkSteps(ownerId, journal.active!);
      journal.active = reconcileAndroidWalkSteps(journal.active!, ownerId, native);
    } catch (error) {
      journal.active = { ...journal.active!, incompleteSteps: true };
      reportClientError(error, { issueKey: "DogWalkWidgetStepStart" });
    }
  } else {
    if (!current || (action === "pause" && !isWalkRunning(current))) return;
    try {
      const native = await pauseAndroidWalkSteps(ownerId, current, action === "finish");
      current = reconcileAndroidWalkSteps(current, ownerId, native);
    } catch (error) {
      current = { ...current, incompleteSteps: true };
      reportClientError(error, { issueKey: "DogWalkWidgetStepStop" });
    }
    if (action === "pause") {
      journal.active = pauseWalk(current, now);
    } else {
      const completed = finishWalk(current, now);
      journal.active = null;
      journal.completed = [completed, ...journal.completed].slice(0, 2000);
    }
  }

  // Discard callbacks belonging to a previous logged-out session.
  if ((await AsyncStorage.getItem(WALK_WIDGET_OWNER_KEY)) !== ownerId) return;
  await saveWalkJournal(ownerId, journal);
  await publishWalkWidgetSnapshot(
    journal.active ?? journal.completed[0] ?? null,
    Date.now(),
    journal.preference.mode,
  );

  try {
    const granted = action === "start" && (await Notifications.getPermissionsAsync()).granted;
    await syncWalkNotifications(ownerId, journal.active, Boolean(granted));
  } catch (error) {
    reportClientError(error, { issueKey: "DogWalkWidgetNotification" });
  }
  // Phone is authoritative. Headless auth may not be hydrated yet; when that
  // happens, normal app foreground/session sync retries the server upload.
  if (action === "finish") {
    void syncDogWalkHistory(ownerId).catch(reportWalkSyncIssue);
  }
}
