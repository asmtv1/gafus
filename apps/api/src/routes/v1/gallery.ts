import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { dispatchGalleryRequest, galleryHttpError, GALLERY_MAX_BODY_BYTES } from "@gafus/gallery-server";

export const galleryRoutes = new Hono();
galleryRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});
galleryRoutes.use("*", bodyLimit({
  maxSize: GALLERY_MAX_BODY_BYTES,
  onError: (c) => c.json({ success: false, error: "Запрос слишком большой", code: "BODY_TOO_LARGE" }, 413, { "Cache-Control": "no-store" }),
}));
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
