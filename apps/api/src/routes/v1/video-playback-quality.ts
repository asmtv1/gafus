import { Hono } from "hono";
import { z } from "zod/v3";
import { recordVideoPlaybackQuality } from "@gafus/core/services/videoPlaybackQuality";
import type { VideoPlaybackQualityEvent } from "@gafus/types";

export const videoPlaybackQualityRoutes = new Hono();
videoPlaybackQualityRoutes.use("*", async (c,next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});

const input = z.object({
  id: z.string().uuid(),
  surface: z.enum(["moments","chat"]),
  platform: z.enum(["web","ios","android"]),
  quality: z.union([z.literal(360),z.literal(720)]),
  mode: z.enum(["auto","manual"]),
  available360: z.boolean(),
  available720: z.boolean(),
  networkClass: z.enum(["wifi","ethernet","cellular","unknown"]),
  saveData: z.boolean(),
  fallback: z.boolean(),
}).strict().refine(event =>
  (event.quality === 360 ? event.available360 : event.available720) &&
  (event.available360 || event.available720),
  {message:"SELECTED_VARIANT_UNAVAILABLE"});

/** One accepted rendition-start event; never include any user or video identifier. */
videoPlaybackQualityRoutes.post("/start", async c => {
  const rawLength = Number(c.req.header("content-length") ?? 0);
  if (rawLength > 2048) return c.json({ success:false, code:"INVALID_EVENT" }, 400);
  let event: VideoPlaybackQualityEvent;
  try {
    const raw = await c.req.text();
    if (raw.length > 2048) return c.json({ success:false, code:"INVALID_EVENT" }, 400);
    const validated = input.safeParse(JSON.parse(raw));
    if (!validated.success) return c.json({ success:false, code:"INVALID_EVENT" }, 400);
    event = validated.data;
  } catch {
    return c.json({ success:false, code:"INVALID_EVENT" }, 400);
  }
  try {
    await recordVideoPlaybackQuality(event);
    return c.json({ success:true }, 202);
  } catch {
    // Playback remains unaffected by analytics failure; clients can retry UUID safely.
    return c.json({ success:false, code:"VIDEO_QUALITY_ANALYTICS_UNAVAILABLE" }, 503);
  }
});
