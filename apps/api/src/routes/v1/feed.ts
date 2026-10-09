import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { dispatchFeedRequest, feedHttpError, FEED_MAX_BODY_BYTES } from "@gafus/feed-server";

export const feedRoutes = new Hono();
feedRoutes.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });
feedRoutes.use("*", bodyLimit({
  maxSize: FEED_MAX_BODY_BYTES,
  onError: c => c.json({ success: false, error: "Слишком большой запрос", code: "BODY_TOO_LARGE" }, 413, { "Cache-Control": "no-store" }),
}));
feedRoutes.all("*", async c => {
  const user = c.get("user");
  if (!user?.id) return c.json({ success: false, error: "Не авторизован", code: "UNAUTHORIZED" }, 401, { "Cache-Control": "no-store" });
  try {
    const path = new URL(c.req.url).pathname.slice("/api/v1/feed".length);
    const data = await dispatchFeedRequest(user.id, c.req.raw, path);
    return c.json({ success: true, data }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    const mapped = feedHttpError(error);
    return c.json(mapped.body, mapped.status as 400, { "Cache-Control": "no-store" });
  }
});
