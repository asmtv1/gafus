import { reportClientErrorAndWait } from "@/shared/lib/error-reporting";
import { hasStoredGpsPoint } from "./walkGpsStorage";
import { walkDurationSeconds, type DogWalk } from "./walkModel";

export const MIN_GPS_DIAGNOSTIC_SECONDS = 120;

/** Report only a durable completed GPS-enabled walk, never coordinates or IDs. */
export async function reportCompletedWalkGps(
  ownerId: string,
  walk: DogWalk,
  isCurrent: () => boolean | Promise<boolean>,
): Promise<void> {
  if (!walk.gpsEnabled || !walk.clientId || walk.finishedAtMs === null ||
      walkDurationSeconds(walk, walk.finishedAtMs) < MIN_GPS_DIAGNOSTIC_SECONDS ||
      !(await isCurrent())) return;
  let hasPoint: boolean;
  try {
    hasPoint = await hasStoredGpsPoint(ownerId, walk.clientId);
  } catch {
    if (await isCurrent()) await reportClientErrorAndWait(new Error("GPS_WALK_STORAGE_UNAVAILABLE"), {
      issueKey: "DogWalkGpsStorageUnavailable",
    });
    return;
  }
  if (!(await isCurrent())) return;
  if (!hasPoint) {
    await reportClientErrorAndWait(new Error("GPS_WALK_NO_POINTS"), { issueKey: "DogWalkGpsNoPoints" });
  } else if (walk.gpsMeters == null || !Number.isFinite(walk.gpsMeters) || walk.gpsMeters < 0) {
    await reportClientErrorAndWait(new Error("GPS_WALK_INSUFFICIENT_FIX"), { issueKey: "DogWalkGpsInsufficientFix" });
  }
}
