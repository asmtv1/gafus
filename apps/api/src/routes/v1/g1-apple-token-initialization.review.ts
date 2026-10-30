/** G1 review-only handler. This router is intentionally NOT registered in app.ts. */
import { Hono } from "hono";
import {
  AppleTokenOwnerUnavailableError,
  initializeAppleTokenForAuthenticatedOwner,
} from "@gafus/core/services/appSubscription";

export const appleTokenInitializationReviewRoutes = new Hono();

appleTokenInitializationReviewRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});

// Must be mounted BEHIND the existing app.ts authMiddleware. Cookie POST then
// requires a trusted Origin; Bearer Expo request remains compatible.
appleTokenInitializationReviewRoutes.post("/apple/token/initialize", async (c) => {
  try {
    const authenticatedOwner = c.get("user");
    const data = await initializeAppleTokenForAuthenticatedOwner(authenticatedOwner.id);
    return c.json({ success: true, data });
  } catch (error) {
    if (error instanceof AppleTokenOwnerUnavailableError) {
      return c.json({ success: false, code: error.code, error: error.message }, 401);
    }
    // Never log token, caller id, body, provider output or database exception.
    return c.json({ success: false, code: "INTERNAL_ERROR", error: "Внутренняя ошибка" }, 500);
  }
});
