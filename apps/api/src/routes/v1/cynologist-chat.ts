import { Hono } from "hono";
import { chatHttpError, dispatchChatRequest } from "@gafus/core/services/cynologistChat/http";
import { acceptChatWebhook } from "@gafus/core/services/cynologistChat";
export const cynologistChatRoutes = new Hono();
cynologistChatRoutes.all("*", async (c) => {
  c.header("Cache-Control", "no-store");
  try {
    const action =
      new URL(c.req.url).pathname.split("/cynologist-chat")[1]?.replace(/^\//, "") ?? "";
    return c.json({
      success: true,
      data: await dispatchChatRequest(c.get("user").id, c.req.raw, action),
    });
  } catch (error) {
    const mapped = chatHttpError(error);
    return c.json(mapped.body, mapped.status as 400);
  }
});
export const streamChatWebhookRoutes = new Hono();
streamChatWebhookRoutes.post("/", async (c) => {
  try {
    const raw = await c.req.text();
    if (raw.length > 65536) return c.json({ success: false }, 413);
    await acceptChatWebhook(raw, c.req.header("x-signature") ?? "");
    return c.json({ success: true });
  } catch (error) {
    const mapped = chatHttpError(error);
    return c.json(mapped.body, mapped.status as 400);
  }
});
