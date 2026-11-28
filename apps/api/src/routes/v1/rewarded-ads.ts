import { Hono } from "hono";

/** Deliberate compatibility tombstone for already-installed native clients.
 * Do not restore an alternate paid-content grant path behind this response. */
export const rewardedAdsRoutes = new Hono();
rewardedAdsRoutes.all("*", (c) => {
  c.header("Cache-Control", "private, no-store");
  return c.json({
    success: false,
    error: "Разблокировка за рекламу больше не поддерживается",
    code: "REWARDED_ACCESS_RETIRED",
  }, 410);
});
