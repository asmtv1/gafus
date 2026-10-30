/** Actual Hono app registration: all new admin routes fail closed before Core/SQL. */
import { describe, expect, it } from "vitest";
import { app } from "../../app";

const protectedUrls = [
  ["GET", "/api/v1/admin/cache"],
  ["POST", "/api/v1/admin/cache/courses/refresh"],
  ["POST", "/api/v1/admin/reengagement/run"],
  ["GET", "/api/v1/admin/gafus-operations/fraud"],
  ["POST", "/api/v1/admin/gafus-operations/fraud/signal1/review"],
  ["GET", "/api/v1/admin/gafus-operations/legacy/preflight"],
  ["POST", "/api/v1/admin/gafus-operations/legacy/import"],
  ["GET", "/api/v1/admin/media/stats"],
  ["GET", "/api/v1/admin/partners"],
  ["GET", "/api/v1/admin/partners/partner1"],
  ["POST", "/api/v1/admin/partners/partner1/mark-paid"],
  ["GET", "/api/v1/admin/users"],
  ["PATCH", "/api/v1/admin/users/user1"],
  ["GET", "/api/v1/admin/users/user1/app-subscription"],
  ["POST", "/api/v1/admin/users/user1/app-subscription"],
  ["GET", "/api/v1/admin/feature-flags"],
  ["PUT", "/api/v1/admin/feature-flags"],
  ["GET", "/api/v1/admin/mail"],
  ["GET", "/api/v1/admin/mail/alerts"],
  ["GET", "/api/v1/admin/analytics/reengagement"],
  ["GET", "/api/v1/admin/analytics/rewarded-ads"],
  ["GET", "/api/v1/admin/profit"],
  ["POST", "/api/v1/admin/profit/video-expenses"],
  ["GET", "/api/v1/admin/moderation/feed/reports"],
  ["POST", "/api/v1/admin/moderation/questions/reports"],
  ["GET", "/api/v1/admin/app-subscriptions"],
  ["POST", "/api/v1/admin/app-subscriptions/promo-codes"],
  ["POST", "/api/v1/admin/app-subscriptions/npd/receipt1/retry"],
  ["GET", "/api/v1/admin/broadcasts/preview"],
  ["POST", "/api/v1/admin/broadcasts"],
  ["GET", "/api/v1/admin/settings/subscriptions"],
  ["PUT", "/api/v1/admin/settings/subscriptions"],
  ["GET", "/api/v1/admin/consultations/schedules/trainer1"],
  ["PUT", "/api/v1/admin/consultations/schedules/trainer1"],
  ["POST", "/api/v1/admin/consultations/schedules/trainer1/day-offs"],
] as const;

describe("actual app ADMIN route mounts deny unauthenticated traffic", () => {
  it.each(protectedUrls)("%s %s is truly protected and private", async (method, url) => {
    const result = await app.request(url, { method });
    expect(result.status).toBe(401);
    expect(result.headers.get("cache-control")?.toLowerCase()).toContain("no-store");
    expect(result.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
