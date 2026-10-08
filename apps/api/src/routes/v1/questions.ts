import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { dispatchQuestionsRequest, questionHttpError } from "@gafus/questions-server";
export const questionsRoutes = new Hono();
questionsRoutes.use(
  "*",
  bodyLimit({
    maxSize: 10 * 1024 * 1024 + 65536,
    onError: (c) => c.json({ success: false, error: "Фото должно быть не больше 10 МБ" }, 413),
  }),
);
questionsRoutes.all("*", async (c) => {
  c.header("Cache-Control", "no-store");
  try {
    const path = new URL(c.req.url).pathname.split("/questions")[1] ?? "";
    return c.json({
      success: true,
      data: await dispatchQuestionsRequest(c.get("user").id, c.req.raw, path),
    });
  } catch (error) {
    const mapped = questionHttpError(error);
    return c.json(mapped.body, mapped.status as 400);
  }
});
