/** AG1 cont144: own article list metadata only; no legacy private media read. */
import {Hono} from "hono";
import { readTrainerOwnArticleMetadataApplication } from "../../modules/trainer-articles/composition/read-own-article-metadata.js";
import type {TrainerArticleOwnMetadataRead} from
  "../../../../../packages/types/src/data/trainer-read-contracts";
export const trainerArticlesOwnSummaryRoutes=new Hono();
trainerArticlesOwnSummaryRoutes.get("/own-summary",async c=>{
 const actor=c.get("user");
 if(!["TRAINER","ADMIN"].includes(actor.role))
  return c.json({success:false,code:"FORBIDDEN",error:"Недостаточно прав"},403);
 if(new URL(c.req.url).search!==""||c.req.raw.body!==null)
  return c.json({success:false,code:"BAD_QUERY",error:"Некорректный запрос"},400);
 try{
  const { articles } = await readTrainerOwnArticleMetadataApplication.execute({
    actorUserId: actor.id,
  });
  return c.json({success:true,data:{articles}} satisfies TrainerArticleOwnMetadataRead,200);
 }catch{
  return c.json({success:false,code:"INTERNAL_SERVER_ERROR",error:"Внутренняя ошибка сервера"},500);
 }
});
