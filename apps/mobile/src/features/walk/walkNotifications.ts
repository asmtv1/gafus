import AsyncStorage from "@react-native-async-storage/async-storage";
import { reportClientError } from "@/shared/lib/tracer";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  isWalkRunning,
  normalizeWalk,
  secondsToNextWalkReminder,
  walkElapsedMs,
  WALK_REMINDER_INTERVAL_SEC,
  type DogWalk,
} from "./walkModel";

const NOTIFICATION_KEY = "gafus:dog-walk:scheduled:v1";
const CHANNEL = "gafus-dog-walk";
const MAX_REMINDERS = 24; // up to 12 hours; avoids consuming every iOS pending-notification slot.
interface ScheduleRecord {
  ownerId: string;
  startedAtMs: number;
  ids: string[];
}

export interface WalkAlertPlan {
  secondsFromNow: number;
  kind: "countdown" | "milestone";
  milestoneMinutes?: number;
}

export function planWalkAlerts(walk: DogWalk, nowMs: number): WalkAlertPlan[] {
  const state = normalizeWalk(walk);
  if (!isWalkRunning(state)) return [];
  if (state.mode === "countdown") {
    const remaining = (state.targetDurationSec ?? 0) * 1000 - walkElapsedMs(state, nowMs);
    return remaining > 0
      ? [{ kind: "countdown", secondsFromNow: Math.max(1, Math.ceil(remaining / 1000)) }]
      : [];
  }
  const first = secondsToNextWalkReminder(state, nowMs);
  const already = Math.floor(walkElapsedMs(state, nowMs) / 1000);
  return Array.from({ length: MAX_REMINDERS }, (_, index) => ({
    kind: "milestone" as const,
    secondsFromNow: first + WALK_REMINDER_INTERVAL_SEC * index,
    milestoneMinutes: Math.floor((already + first) / 60) + 30 * index,
  }));
}

async function readRecord(): Promise<ScheduleRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as ScheduleRecord;
    return data &&
      typeof data.ownerId === "string" &&
      typeof data.startedAtMs === "number" &&
      Array.isArray(data.ids)
      ? data
      : null;
  } catch (error) {
    reportClientError(error, { issueKey: "DogWalkScheduledAlertRecord" });
    return null;
  }
}

async function cancelStoredNotifications(): Promise<void> {
  const previous = await readRecord();
  if (!previous) return;
  for (const id of previous.ids) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }
  await AsyncStorage.removeItem(NOTIFICATION_KEY);
}

/** Native notifications continue while JS is suspended; default OS alert sound. */
export async function configureWalkAlertPermission(): Promise<boolean> {
  // Foreground notifications need a handler too. Match the existing push handler.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Напоминания о прогулке",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 180, 250],
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

let notificationsQueue: Promise<void> = Promise.resolve();

/** Call only on start/pause/resume/finish/account-switch, not on each pedometer sample. */
export function syncWalkNotifications(
  ownerId: string | null,
  walk: DogWalk | null,
  permissionGranted: boolean,
  nowMs = Date.now(),
): Promise<void> {
  const task = notificationsQueue
    .catch(() => undefined)
    .then(async () => {
      await cancelStoredNotifications();
      if (!ownerId || !walk || !permissionGranted || !isWalkRunning(walk)) return;
      const plan = planWalkAlerts(walk, nowMs);
      const record: ScheduleRecord = { ownerId, startedAtMs: walk.startedAtMs, ids: [] };
      // Persist each successful ID so partial failure can still be cleaned up.
      for (const alert of plan) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: alert.kind === "countdown" ? "Время прогулки вышло" : "Прогулка с собакой",
            body:
              alert.kind === "countdown"
                ? "Обратный отсчёт завершился. Можно продолжить прогулку или завершить её."
                : `Вы гуляете уже ${alert.milestoneMinutes} мин.`,
            sound: "default",
            data: { kind: "dogWalk", ownerId, startedAtMs: walk.startedAtMs },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: alert.secondsFromNow,
            repeats: false,
            ...(Platform.OS === "android" ? { channelId: CHANNEL } : {}),
          },
        });
        record.ids.push(id);
        await AsyncStorage.setItem(NOTIFICATION_KEY, JSON.stringify(record));
      }
    });
  notificationsQueue = task;
  return task;
}
