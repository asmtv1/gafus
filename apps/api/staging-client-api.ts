import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { feedRoutes } from "./src/routes/v1/feed.js";
import { authMiddleware } from "./src/middleware/auth.js";
import { feedPlaybackResponse } from "@gafus/feed-server";
import { prisma } from "@gafus/prisma";
import { connection as redis } from "@gafus/queues";
if (
  process.env.GAFUS_CLIENT_STAGE_ONLY !== "localhost-media-jwt" ||
  !process.env.DATABASE_URL?.includes("@127.0.0.1:55448/gafus_media_stage") ||
  !process.env.REDIS_URL?.includes("@127.0.0.1:56389") ||
  process.env.FEED_S3_ENDPOINT !== "https://s3.cloud.ru" ||
  process.env.FEED_BUCKET !== "gafus-feed-private" ||
  process.env.FEED_CDN_BASE_URL !== "https://feed.gafus.ru" ||
  process.env.FEED_ENABLED !== "true" ||
  process.env.FEED_PROCESSOR_READY !== "true" ||
  process.env.FEED_MEDIA_FALLBACK_ENABLED !== "true" ||
  process.env.FEED_CDN_EDGE_TOKEN_VERIFIED !== "true" ||
  process.env.GALLERY_ENABLED !== "false" ||
  Number(process.env.API_PORT) !== 31341
)
  throw Error("ISOLATED_CLIENT_STAGE_SAFETY_GUARD");
const app = new Hono();
app.get("/__stage__/health", async (c) => {
  try {
    await Promise.all([prisma.$queryRawUnsafe("SELECT 1"), redis.ping()]);
    return c.json({ status: "ready", environment: "isolated-client-staging" });
  } catch {
    return c.json({ status: "unready" }, 503);
  }
});
app.use("/api/v1/feed/*", authMiddleware);
app.route("/api/v1/feed", feedRoutes);
app.get("/api/v1/feed-playback/:media", async (c) => feedPlaybackResponse(c.req.raw));
const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 31341 });
console.log("GAFUS_ISOLATED_CLIENT_STAGE=127.0.0.1:31341");
process.on("SIGTERM", () => {
  server.close();
  void redis.quit();
  void prisma.$disconnect();
});
