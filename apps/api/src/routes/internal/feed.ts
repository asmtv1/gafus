import { Hono } from "hono";
import { dispatchFeedInternalRequest, feedHttpError } from "@gafus/feed-server";

export const internalFeedRoutes = new Hono();
internalFeedRoutes.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });
internalFeedRoutes.all("*", async c => {
  try {
    return c.json(await dispatchFeedInternalRequest(c.req.raw, new URL(c.req.url).pathname), 200);
  } catch (error) {
    const mapped = feedHttpError(error);
    return c.json(mapped.body, mapped.status as 400);
  }
});
