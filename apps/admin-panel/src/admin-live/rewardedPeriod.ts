/** Next /main-panel/rewarded-ads uses ?period=7|30|90, Hono uses ?days=. */
export type RewardedPeriod = "7" | "30" | "90";
export function rewardedPeriodFromSearch(search: string): RewardedPeriod {
  const period = new URLSearchParams(search).get("period");
  return period === "7" || period === "30" || period === "90" ? period : "30";
}
export function rewardedPeriodUrl(days: RewardedPeriod): string {
  if (!["7", "30", "90"].includes(days)) throw Error("Некорректный период рекламы");
  return `/main-panel/rewarded-ads?period=${days}`;
}
