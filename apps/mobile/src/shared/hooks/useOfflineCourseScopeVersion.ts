import { useSyncExternalStore } from "react";
import { getOfflineCourseScopeVersion, subscribeOfflineCourseSession } from "@/shared/lib/offline/offlineCourseSession";

/** Remount owner-sensitive media and isolate in-flight query results on account change. */
export function useOfflineCourseScopeVersion(): number {
  return useSyncExternalStore(subscribeOfflineCourseSession, getOfflineCourseScopeVersion, getOfflineCourseScopeVersion);
}
