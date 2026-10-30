import type { AchievementDataWire } from "@gafus/types";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { coursesApi, type CourseListItem } from "./courses";
import { achievementsApi } from "./achievements";

export type AchievementActor = { ownerId: string; authEpoch: string };
export function verifiedAchievementActor(): AchievementActor | null {
  const auth = useAuthStore.getState();
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  if (
    !auth.isAuthenticated ||
    auth.isLoading ||
    !auth.user?.id ||
    binding?.principalId !== auth.user.id ||
    !binding.authEpoch
  )
    return null;
  return { ownerId: auth.user.id, authEpoch: binding.authEpoch };
}
export function sameAchievementActor(actor: AchievementActor | null): boolean {
  if (!actor) return false;
  const current = verifiedAchievementActor();
  return current?.ownerId === actor.ownerId && current.authEpoch === actor.authEpoch;
}
export type AchievementResult =
  | { kind: "granted"; data: AchievementDataWire }
  | { kind: "subscription_required" | "unauthorized" | "unknown" | "stale" };
export function achievementResultForResponse(response: {
  success: boolean;
  code?: string;
  data?: AchievementDataWire;
}): AchievementResult {
  if (response.success && response.data && Array.isArray(response.data.achievements))
    return { kind: "granted", data: response.data };
  if (response.code === "SUBSCRIPTION_REQUIRED") return { kind: "subscription_required" };
  if (
    response.code === "UNAUTHORIZED" ||
    response.code === "AUTH_REQUIRED" ||
    response.code === "AUTH_REFRESH_UNAVAILABLE"
  )
    return { kind: "unauthorized" };
  if (response.code === "G05_SESSION_CHANGED") return { kind: "stale" };
  return { kind: "unknown" };
}
/** No unscoped private data and no cached success on 403/401/503. */
export function achievementsForActor(actor: AchievementActor | null) {
  const guard = () => sameAchievementActor(actor);
  return {
    queryKey: ["achievements", "owner", actor?.ownerId ?? null, actor?.authEpoch ?? null] as const,
    enabled: guard(),
    gcTime: 0,
    staleTime: 0,
    refetchOnMount: "always" as const,
    retry: false,
    queryFn: async (): Promise<AchievementResult> => {
      if (!guard()) return { kind: "stale" };
      const response = await achievementsApi.getAchievements(guard);
      if (!guard()) return { kind: "stale" };
      return achievementResultForResponse(response);
    },
  };
}
/** User-course progress is private and must not reuse the global catalog cache. */
export function achievementsCoursesForActor(actor: AchievementActor | null, enabled: boolean) {
  const guard = () => sameAchievementActor(actor);
  return {
    queryKey: [
      "achievements",
      "courses",
      "owner",
      actor?.ownerId ?? null,
      actor?.authEpoch ?? null,
    ] as const,
    enabled: enabled && guard(),
    gcTime: 0,
    staleTime: 0,
    refetchOnMount: "always" as const,
    retry: false,
    queryFn: async (): Promise<CourseListItem[]> => {
      if (!guard()) return [];
      const res = await coursesApi.getAll(undefined, guard);
      if (!guard() || !res.success || !Array.isArray(res.data)) return [];
      return res.data.filter((course) => course.userStatus !== "NOT_STARTED");
    },
  };
}
