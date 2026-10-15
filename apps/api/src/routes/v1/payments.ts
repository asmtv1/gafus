import { Hono } from "hono";

/**
 * Compatibility tombstones for previously published mobile clients.
 * No individual course/article payment can be created or verified anymore.
 * Subscription payments use /api/v1/app-subscription.
 */
export const paymentsRoutes = new Hono();
const legacyGone = {
  success: false,
  code: "LEGACY_PURCHASES_DISABLED",
  error: "Разовые покупки курсов и статей прекращены. Оформите подписку.",
};
paymentsRoutes.post("/create", (c) => c.json(legacyGone, 410));
paymentsRoutes.post("/apple/verify", (c) => c.json(legacyGone, 410));
paymentsRoutes.get("/apple/course-metadata", (c) => c.json(legacyGone, 410));
