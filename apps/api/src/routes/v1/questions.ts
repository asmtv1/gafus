import { Hono } from "hono";
import { z } from "zod/v3";
import { reserveQuestionsPhoto, confirmQuestionsPhoto,
  statusQuestionsPhoto, discardQuestionsV2Photo
} from "../../modules/questions/media-v2-upload.js";

import { bodyLimit } from "hono/body-limit";
import { dispatchQuestionsRequest, questionHttpError } from "@gafus/questions-server";
export const questionsRoutes = new Hono();
// Privacy policy must also cover body-limit rejections before dispatcher runs.
questionsRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
  c.header("Cache-Control", "no-store");
});
questionsRoutes.use(
  "*",
  bodyLimit({
    maxSize: 140000,
    onError: (c) => c.json({ success: false, error: "Фото должно быть не больше 10 МБ" }, 413),
  }),
);

const photoReservation = z.object({
  mime: z.enum(["image/jpeg","image/png","image/webp"]),
  bytes: z.number().int().min(12).max(10*1024*1024),
}).strict();
function photoError(c: import("hono").Context, error:unknown) {
  const mapped=questionHttpError(error);
  return c.json(mapped.body,mapped.status as 400);
}
questionsRoutes.post("/photos/reservations",async c=>{
  try{return c.json({success:true,data:await reserveQuestionsPhoto(
    c.get("user").id,photoReservation.parse(await c.req.json()))},201);}
  catch(e){return photoError(c,e);}
});
questionsRoutes.post("/photos/:id/confirm",async c=>{
  try{return c.json({success:true,data:await confirmQuestionsPhoto(
    c.get("user").id,c.req.param("id"))});}
  catch(e){return photoError(c,e);}
});
questionsRoutes.get("/photos/:id/status",async c=>{
  try{return c.json({success:true,data:await statusQuestionsPhoto(
    c.get("user").id,c.req.param("id"))});}
  catch(e){return photoError(c,e);}
});
questionsRoutes.delete("/photos/:id",async c=>{
  try{return c.json({success:true,data:await discardQuestionsV2Photo(
    c.get("user").id,c.req.param("id"))});}
  catch(e){return photoError(c,e);}
});
// Previous multipart upload through the API is intentionally retired.
questionsRoutes.post("/photos",c=>c.json({success:false,
  error:"Используйте прямую загрузку фото",code:"PHOTO_UPLOAD_V2_REQUIRED"},410));

questionsRoutes.all("*", async (c) => {
  try {
    // Strip only the exact mounted prefix. Splitting on the word "questions"
    // can silently turn /:id/questions/anything into the destructive /:id.
    const pathname = new URL(c.req.url).pathname;
    const prefix = "/api/v1/questions";
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) {
      return c.json({ success: false, error: "Маршрут не найден", code: "NOT_FOUND" }, 404);
    }
    const path = pathname.slice(prefix.length);
    return c.json({
      success: true,
      data: await dispatchQuestionsRequest(c.get("user").id, c.req.raw, path),
    });
  } catch (error) {
    const mapped = questionHttpError(error);
    return c.json(mapped.body, mapped.status as 400);
  }
});
