/**
 * AG4 TR013 frozen CURRENT trainer visible-steps read contract.
 * JWT and limiter run in app.ts before this route; the Core query owns its
 * author/daily policy. This adapter only validates HTTP and projects a narrow
 * public-to-the-actor DTO, including narrow nested relation whitelist.
 *
 * NO writes, draft edits, media, templates, schema or revision semantics.
 */
import { Hono } from "hono";
import type { TrainerVisibleStepsRead } from
  "../../../../../packages/types/src/data/trainer-read-contracts";
import { readVisibleStepsApplication } from "../../modules/trainer-steps/composition/read-visible-steps.js";

export const trainerStepsRoutes = new Hono();

trainerStepsRoutes.get("/", async c=>{
  const params=c.req.queries();
  const keys=Object.keys(params);
  if (keys.some(key=>key!=="isDailyCourse") ||
      (params.isDailyCourse!==undefined && params.isDailyCourse.length!==1) ||
      c.req.raw.body!==null) {
    return c.json({success:false,code:"BAD_QUERY",error:"Некорректный запрос"},400);
  }
  const raw=params.isDailyCourse?.[0];
  if (raw!==undefined && raw!=="true" && raw!=="false") {
    return c.json({success:false,code:"BAD_QUERY",error:"Некорректный запрос"},400);
  }
  const isDailyCourse=raw==="true";
  const actor=c.get("user");
  if (!["TRAINER","ADMIN","MODERATOR"].includes(actor.role)) {
    return c.json({success:false,code:"FORBIDDEN",error:"Недостаточно прав"},403);
  }
  try {
    // The caller cannot override authorId or the trusted staff boolean.
    const allowMixed=actor.role==="ADMIN" || actor.role==="MODERATOR";
    const data = await readVisibleStepsApplication.execute({
      actorUserId: actor.id, allowMixed, isDailyCourse,
    });
    return c.json({success:true,data} satisfies TrainerVisibleStepsRead);
  } catch {
    return c.json({
      success:false,code:"INTERNAL_SERVER_ERROR",error:"Внутренняя ошибка сервера",
    },500);
  }
});
