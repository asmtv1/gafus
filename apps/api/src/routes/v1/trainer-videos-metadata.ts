/** AG1 v5: server-owned trainer videos safe metadata only. */
import {Hono} from "hono";
import {prisma} from "@gafus/prisma";
import type {TrainerVideoMetadataItem,TrainerVideoMetadataRead} from
  "../../../../../packages/types/src/data/trainer-read-contracts";
export const trainerVideosMetadataRoutes=new Hono();
trainerVideosMetadataRoutes.get("/metadata",async c=>{
 const actor=c.get("user");
 if(!["TRAINER","ADMIN"].includes(actor.role))
  return c.json({success:false,code:"FORBIDDEN",error:"Недостаточно прав"},403);
 if(new URL(c.req.url).search!==""||c.req.raw.body!==null)
  return c.json({success:false,code:"BAD_QUERY",error:"Некорректный запрос"},400);
 try{
  const rows=await prisma.trainerVideo.findMany({
   where:actor.role==="ADMIN"?undefined:{trainerId:actor.id},
   orderBy:{createdAt:"desc"},
   select:{id:true,displayName:true,transcodingStatus:true,
    durationSec:true,createdAt:true},
  });
  const videos:TrainerVideoMetadataItem[]=rows.map(row=>{
   if(!row.id||
    (row.displayName!==null&&typeof row.displayName!=="string")||
    !["PENDING","PROCESSING","COMPLETED","FAILED"].includes(row.transcodingStatus)||
    (row.durationSec!==null&&(!Number.isSafeInteger(row.durationSec)||row.durationSec<0))||
    !(row.createdAt instanceof Date)||!Number.isFinite(row.createdAt.getTime()))
    throw new Error("INVALID_VIDEO_METADATA_SOURCE");
   return {id:row.id,displayName:row.displayName,
    transcodingStatus:row.transcodingStatus,durationSec:row.durationSec,
    createdAt:row.createdAt.toISOString()};
  });
  return c.json({success:true,data:{videos}} satisfies TrainerVideoMetadataRead);
 }catch{
  return c.json({success:false,code:"INTERNAL_SERVER_ERROR",error:"Внутренняя ошибка сервера"},500);
 }
});
