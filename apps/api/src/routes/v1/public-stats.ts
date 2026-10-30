import {Hono} from "hono";
import {createWebLogger} from "@gafus/logger";

const logger=createWebLogger("api-public-platform-stats");
export const publicStatsRoutes=new Hono();
const TTL=3_600_000;
let cached:{students:number;at:number}|null=null;
let inFlight:Promise<number>|null=null;

/** Only aggregated public USER count, identical to Next getPlatformStudentCount.
 * Cache DB reads for one hour across requests, including concurrent GETs.
 * Never expose names, ids, tokens, session information or raw DB failures.
 */
publicStatsRoutes.get("/",async c=>{
 try{
  const now=Date.now();
  if(cached&&now-cached.at<TTL)
   return c.json({success:true,data:{students:cached.students}},200,
    {"Cache-Control":"public, max-age=3600"});
  if(!inFlight){
   inFlight=(async()=>{
    const {countPlatformStudents}=await import(
      "../../../../../packages/core/src/services/user/platformStats.js");
    const students=await countPlatformStudents();
    if(!Number.isSafeInteger(students)||students<0)
      throw new Error("Invalid count");
    cached={students,at:Date.now()};
    return students;
   })();
  }
  const students=await inFlight;
  return c.json({success:true,data:{students}},200,
   {"Cache-Control":"public, max-age=3600"});
 }catch{
  logger.error("Public aggregate statistics unavailable");
  return c.json({success:false,error:"Статистика временно недоступна"},503,
   {"Cache-Control":"no-store"});
 }finally{inFlight=null;}
});
