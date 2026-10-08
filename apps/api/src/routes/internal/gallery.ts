import { Hono } from "hono";
import { dispatchGalleryInternalRequest, galleryHttpError, GALLERY_MAX_BODY_BYTES } from "@gafus/gallery-server";

export const internalGalleryRoutes = new Hono();
internalGalleryRoutes.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });
internalGalleryRoutes.all("*", async (c) => {
  const path = new URL(c.req.url).pathname;
  try {
    // The dispatcher reads the raw bounded stream and verifies its signature before JSON parsing.
    const declared = Number(c.req.header("content-length") ?? 0);
    if (declared > GALLERY_MAX_BODY_BYTES) return c.json({ success: false, error: "Запрос слишком большой", code: "BODY_TOO_LARGE" }, 413, { "Cache-Control": "no-store" });
    // Cloud clients consume the core DTO directly, including null claims and job arrays.
    return c.json(await dispatchGalleryInternalRequest(c.req.raw, path), 200, { "Cache-Control": "no-store" });
  } catch (error) {
    const mapped = galleryHttpError(error);
    return c.json(mapped.body, mapped.status as 400, { "Cache-Control": "no-store" });
  }
});
