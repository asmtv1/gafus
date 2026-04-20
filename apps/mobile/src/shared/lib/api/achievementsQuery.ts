import { achievementsApi } from "./achievements";

/** Единый queryKey/queryFn для вкладки «Достижения» и префетча. */
export const achievementsQueryOptions = {
  queryKey: ["achievements"] as const,
  queryFn: achievementsApi.getAchievements,
};
