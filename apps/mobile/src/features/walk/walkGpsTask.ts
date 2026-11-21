import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import {
  activeGpsSession,
  activateGpsSession,
  deactivateAllGpsSessions,
  deactivateGpsSession,
  persistGpsBatch,
  readGpsMotionPolicy,
  saveGpsMotionPolicy,
} from "./walkGpsStorage";
import {
  advanceWalkGpsPolicy,
  detectWalkGpsMode,
  WALK_GPS_INTERVALS,
  type WalkGpsMode,
} from "./walkAdaptiveGps";
import { hasWalkLocationAccess } from "./location-permissions/walkLocationPermissionFlow";
import { reportClientError } from "@/shared/lib/error-reporting";

export const DOG_WALK_GPS_TASK = "gafus.dogwalk.gps.v1";

let gpsOperation: Promise<unknown> = Promise.resolve();

function runGpsOperation<T>(operation: () => Promise<T>): Promise<T> {
  // Foreground restoration, permission completion and widget actions use one native task.
  const next = gpsOperation.catch(() => undefined).then(operation);
  gpsOperation = next;
  return next;
}

// Imported by widget-entry.ts before expo-router/entry, including headless launches.
TaskManager.defineTask(DOG_WALK_GPS_TASK, async ({ data, error }) => {
  if (error) {
    reportClientError(error, { issueKey: "DogWalkGpsTask" });
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (!locations?.length) return;
  try {
    const fixes = locations.map((l) => ({
      latitude: l.coords.latitude,
      longitude: l.coords.longitude,
      timestamp: l.timestamp,
      accuracy: l.coords.accuracy,
      speed: l.coords.speed,
    }));
    await persistGpsBatch(fixes);
    // Adaptation is best-effort and can never roll back an already persisted GPS batch.
    try {
      await adaptWalkGpsToMotion(fixes);
    } catch (adaptError) {
      reportClientError(adaptError, { issueKey: "DogWalkGpsAdaptiveMode" });
    }
  } catch (failure) {
    reportClientError(failure, { issueKey: "DogWalkGpsSave" });
  }
});

function gpsTaskOptions(mode: WalkGpsMode, widgetInitiated = false): Location.LocationTaskOptions {
  const hints = WALK_GPS_INTERVALS[mode];
  return {
    accuracy:
      mode === "walking"
        ? Location.Accuracy.High
        : mode === "slow"
          ? Location.Accuracy.Balanced
          : Location.Accuracy.Low,
    distanceInterval: hints.distanceInterval,
    ...(Platform.OS === "android"
      ? {
          ...(widgetInitiated ? { widgetInitiated: true } : {}),
          timeInterval: hints.timeInterval,
          foregroundService: {
            notificationTitle: "GAFUS · Идёт прогулка",
            notificationBody: "Записываем маршрут прогулки с собакой",
            notificationColor: "#66864c",
            killServiceOnDestroy: false,
          },
        }
      : {
          activityType: Location.ActivityType.Fitness,
          pausesUpdatesAutomatically: true,
          deferredUpdatesInterval: mode === "walking" ? 5_000 : 15_000,
          deferredUpdatesDistance: hints.distanceInterval,
          showsBackgroundLocationIndicator: true,
        }),
  };
}

/** Switches only after sustained movement and a cooldown; works in a headless callback. */
export async function adaptWalkGpsToMotion(
  fixes: readonly {
    latitude: number;
    longitude: number;
    timestamp: number;
    accuracy: number | null;
    speed: number | null;
  }[],
): Promise<void> {
  return runGpsOperation(async () => {
    const active = await activeGpsSession();
    if (!active || !fixes.length) return;
    const before = await readGpsMotionPolicy(active.ownerId, active.walkId);
    const now = Math.max(...fixes.map((p) => p.timestamp));
    const next = advanceWalkGpsPolicy(before, detectWalkGpsMode(fixes), now);
    if (next.mode === before.mode) {
      if (
        next.candidate !== before.candidate ||
        next.candidateSinceMs !== before.candidateSinceMs
      ) {
        await saveGpsMotionPolicy(active.ownerId, active.walkId, next);
      }
      return;
    }
    // Pause and stop persist before shutting down native GPS. Never restart an inactive walk.
    const latest = await activeGpsSession();
    if (latest?.ownerId !== active.ownerId || latest.walkId !== active.walkId) return;
    if (!(await Location.hasStartedLocationUpdatesAsync(DOG_WALK_GPS_TASK))) return;
    await Location.startLocationUpdatesAsync(DOG_WALK_GPS_TASK, gpsTaskOptions(next.mode));
    await saveGpsMotionPolicy(active.ownerId, active.walkId, next);
    const stillActive = await activeGpsSession();
    if (!stillActive && (await Location.hasStartedLocationUpdatesAsync(DOG_WALK_GPS_TASK))) {
      await Location.stopLocationUpdatesAsync(DOG_WALK_GPS_TASK);
    }
  });
}

/** The widget may start this only if permissions have already been granted. */
export function startWalkGps(
  ownerId: string,
  walkId: string,
  widgetInitiated = false,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  return runGpsOperation(async () => {
    if (!isCurrent()) return false;
    const allowed = await hasWalkLocationAccess();
    const wasActive = await activeGpsSession();
    if (!isCurrent()) return false;
    const sameWalk = wasActive?.ownerId === ownerId && wasActive.walkId === walkId;
    if (!allowed) {
      // Keep the recorded points and distance when Android revokes access.
      if (sameWalk) await stopGpsSession(ownerId, walkId);
      return false;
    }

    const alreadyRegistered = await Location.hasStartedLocationUpdatesAsync(DOG_WALK_GPS_TASK);
    if (!isCurrent()) return false;
    if (sameWalk && alreadyRegistered) return true;
    if (alreadyRegistered) await Location.stopLocationUpdatesAsync(DOG_WALK_GPS_TASK);
    // An OS-killed task resumed after a gap must not connect unrelated coordinates.
    if (sameWalk) await deactivateGpsSession(ownerId, walkId);
    if (!isCurrent()) return false;
    await activateGpsSession(ownerId, walkId);
    try {
      if (!isCurrent()) {
        await stopGpsSession(ownerId, walkId);
        return false;
      }
      await Location.startLocationUpdatesAsync(
        DOG_WALK_GPS_TASK,
        gpsTaskOptions("walking", widgetInitiated),
      );
      if (isCurrent()) return true;
      await stopGpsSession(ownerId, walkId);
      return false;
    } catch (error) {
      await deactivateGpsSession(ownerId, walkId);
      reportClientError(error, { issueKey: "DogWalkGpsTaskRegistration" });
      throw error;
    }
  });
}

async function stopGpsSession(ownerId: string, walkId: string): Promise<void> {
  // Commit the stop before awaiting the OS: late batches must not append to a paused walk.
  await deactivateGpsSession(ownerId, walkId);
  if (
    !(await activeGpsSession()) &&
    (await Location.hasStartedLocationUpdatesAsync(DOG_WALK_GPS_TASK))
  ) {
    await Location.stopLocationUpdatesAsync(DOG_WALK_GPS_TASK);
  }
}

export function stopWalkGps(ownerId: string, walkId: string): Promise<void> {
  return runGpsOperation(() => stopGpsSession(ownerId, walkId));
}

export function stopAllWalkGps(isCurrent: () => boolean): Promise<void> {
  return runGpsOperation(async () => {
    if (!isCurrent()) return;
    await deactivateAllGpsSessions();
    if (await Location.hasStartedLocationUpdatesAsync(DOG_WALK_GPS_TASK)) {
      await Location.stopLocationUpdatesAsync(DOG_WALK_GPS_TASK);
    }
  });
}
