import { Hono } from "hono";
import { dispatchGalleryRequest, galleryHttpError } from "@gafus/gallery-server";

export const galleryRoutes = new Hono();
galleryRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});
// The bounded dispatcher reads and rejects >16KiB itself with GalleryError(413).
// Hono bodyLimit wraps the stream, emitting an unrelated BodyLimitError that
// the Gallery error mapper otherwise turns into a misleading HTTP 500.
galleryRoutes.all("*", async (c) => {
  const user = c.get("user");
  if (!user?.id) return c.json({ success: false, error: "Не авторизован", code: "UNAUTHORIZED" }, 401, { "Cache-Control": "no-store" });
  try {
    const path = new URL(c.req.url).pathname.slice("/api/v1/gallery".length);
    return c.json({ success: true, data: await dispatchGalleryRequest(user.id, c.req.raw, path) }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    const mapped = galleryHttpError(error);
    return c.json(mapped.body, mapped.status as 400, { "Cache-Control": "no-store" });
  }
});
