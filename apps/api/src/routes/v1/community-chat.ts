import { Hono } from "hono";
import { chatHttpError, dispatchChatRequest } from "@gafus/chat-server";
export const communityChatRoutes = new Hono();
communityChatRoutes.all("*", async (c) => {
  c.header("Cache-Control", "no-store");
  try {
    const action =
      new URL(c.req.url).pathname.split("/community-chat")[1]?.replace(/^\//, "") ?? "";
    return c.json({
      success: true,
      data: await dispatchChatRequest(c.get("user").id, c.req.raw, action, true),
    });
  } catch (error) {
    const mapped = chatHttpError(error);
    return c.json(mapped.body, mapped.status as 400);
  }
});
