export type ServerAction<T = unknown> = (...args: unknown[]) => Promise<T>;
export type ServiceWorkerCacheStrategy =
  | "cache-first"
  | "network-first"
  | "stale-while-revalidate"
  | "cache-only"
  | "html-first";
export type SWRCacheStrategy = "courses" | "user-profile" | "statistics" | "search" | "real-time";
export type CacheStrategy = ServiceWorkerCacheStrategy | SWRCacheStrategy;
export type CourseData = {
  id: string;
  name: string;
  description: string;
  duration: number;
};
export type UserProfileData = {
  id: string;
  name: string;
  bio?: string;
  avatarUrl?: string;
};
export type SWRStatisticsData = {
  id: string;
  value: number;
  label: string;
};
//# sourceMappingURL=index.d.ts.map
