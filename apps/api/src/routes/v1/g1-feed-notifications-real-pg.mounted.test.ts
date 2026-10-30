/** AG1 independent actual REGISTERED Hono/JWT → Feed dispatch/Core → own PG. */
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
// Stub only external Redis rate-store IO; signed auth, Feed and Prisma remain real.
vi.mock("@hono-rate-limiter/redis",()=>({RedisStore:class{
 windowMs=60000;
 init(c:{windowMs:number}){this.windowMs=c.windowMs;}
 async increment(){return {totalHits:1,resetTime:new Date(Date.now()+this.windowMs)};}
 async decrement(){return undefined;}
 async resetKey(){return undefined;}
}}));
import { PrismaClient } from "../../../../../packages/prisma/node_modules/@prisma/client";
import { prisma } from "@gafus/prisma";
// No mock of @gafus/auth, actual Prisma, Feed dispatcher or Core.
import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";

const random=randomBytes(6).toString("hex");
const tag="ag1feedhttp_"+random+"_";
const id=(suffix:string)=>"c"+(random+suffix).padEnd(24,"0").slice(0,24);
const A=id("a"), B=id("b"), ACTOR=id("actor");
const POST=id("post"), HIDDEN_POST=id("hiddenPost");
const N_A=id("noticeA"), N_B=id("noticeB"), N_PUSH=id("noticePush"), N_HIDDEN=id("noticeHidden");
const ADMIN_URL=process.env.G1_AG1_FEED_HTTP_ADMIN_URL??"";
const admin=new PrismaClient({datasources:{db:{url:ADMIN_URL}}});
const URL="/api/v1/feed/notifications";
const tokens:Record<string,string>={};
let connected=false;
const request=(actor:string,suffix="")=>app.request(URL+suffix,{
 method:"GET",headers:actor?{Authorization:"Bearer "+tokens[actor]}:{},
});
const cache=(response:Response)=>expect(response.headers.get("cache-control"))
 .toContain("no-store");

beforeAll(async()=>{
 if(process.env.G1_AG1_OWN_PG!=="1")throw Error("REFUSE_OWN_PG_OPT_IN");
 for(const [url,role] of [[process.env.DATABASE_URL??"","ag1_stats135_read"],
  [ADMIN_URL,"ag1_course"]] as const){
  if(!url.includes("postgresql://"+role+"@")||
   !url.includes("/ag1_stats135?")||!url.includes(".ag1-course-pg/sock"))
   throw Error("REFUSE_EXTERNAL_FEED_SQL");
 }
 process.env.JWT_SECRET=randomBytes(48).toString("hex");
 process.env.FEED_ENABLED="true";
 process.env.FEED_PROCESSOR_READY="true";
 await admin.$connect();connected=true;
 const checks=await prisma.$queryRaw<{sel:boolean;ins:boolean;upd:boolean;del:boolean}[]>`
 SELECT has_table_privilege(current_user,'public."FeedNotification"','SELECT') AS sel,
 has_table_privilege(current_user,'public."FeedNotification"','INSERT') AS ins,
 has_table_privilege(current_user,'public."FeedNotification"','UPDATE') AS upd,
 has_table_privilege(current_user,'public."FeedNotification"','DELETE') AS del`;
 expect(checks).toEqual([{sel:true,ins:false,upd:false,del:false}]);
 for(const [name,userId] of [["A",A],["B",B],["ACTOR",ACTOR]] as const){
  const username=tag+name.toLowerCase();
  await admin.user.create({data:{id:userId,username,email:username+"@example.invalid",
   password:"synthetic-no-login",role:"USER"}});
  if(name!=="ACTOR")tokens[name]=await generateAccessToken({id:userId,username,role:"USER"});
 }
 for(const [postId,moderation,name] of [[POST,"visible","normal"],
  [HIDDEN_POST,"hidden","hidden"]] as const){
  await admin.feedPost.create({data:{id:postId,authorId:A,
   clientRequestId:tag+name,status:"published",moderationState:moderation}});
 }
 for(const [noticeId,recipientId,postId,kind,day] of [
  [N_A,A,POST,"comment",4],
  [N_HIDDEN,A,HIDDEN_POST,"reply",3],
  [N_PUSH,A,POST,"author_post",5],
  [N_B,B,POST,"comment",6],
 ] as const){
  await admin.feedNotification.create({data:{id:noticeId,recipientId,postId,
   kind,actorIds:[ACTOR],createdAt:new Date(`2032-10-0${day}T00:00:00Z`)}});
 }
},90000);
afterAll(async()=>{
 try{if(connected){
  await admin.feedNotification.deleteMany({where:{id:{in:[N_A,N_B,N_PUSH,N_HIDDEN]}}});
  await admin.feedPost.deleteMany({where:{id:{in:[POST,HIDDEN_POST]}}});
  await admin.user.deleteMany({where:{id:{in:[A,B,ACTOR]}}});
 }}finally{
  process.env.FEED_ENABLED="false";
  process.env.FEED_PROCESSOR_READY="false";
  await prisma.$disconnect();await admin.$disconnect();
 }
},90000);

describe("AG1 registered notifications GET actual JWT/Feed/Core/Prisma PG",()=>{
 it("A/B recipient and push-only source SQL, strict current DTO with no PII",async()=>{
  for(const name of ["A","B","A"]){
   const response=await request(name);expect(response.status).toBe(200);cache(response);
   const result=await response.json();
   expect(result.success).toBe(true);
   expect(result.data.items.map((n:{id:string})=>n.id)).toEqual(
    name==="A"?[N_A,N_HIDDEN]:[N_B]);
   expect(JSON.stringify(result)).not.toContain("@example.invalid");
   for(const item of result.data.items){
    expect(Object.keys(item).sort()).toEqual(["actorCount","actors","commentId",
     "createdAt","id","kind","postId","reaction","readAt","targetAvailable"]);
    expect(item.actors).toEqual([{
     id:ACTOR,username:tag+"actor",name:tag+"actor",avatarUrl:null,
    }]);
   }
  }
 });
 it("A cursor, target availability, guest401 and bad cursor400 private",async()=>{
  const first=await request("A","?pageSize=1");
  expect(first.status).toBe(200);cache(first);
  const firstResult=await first.json();
  expect(firstResult.data.items.map((item:{id:string})=>item.id)).toEqual([N_A]);
  expect(firstResult.data.items[0].targetAvailable).toBe(true);
  const second=await request("A","?pageSize=1&cursor="+
   encodeURIComponent(firstResult.data.nextCursor));
  expect(second.status).toBe(200);cache(second);
  const secondResult=await second.json();
  expect(secondResult.data.items.map((item:{id:string})=>item.id)).toEqual([N_HIDDEN]);
  expect(secondResult.data.items[0].targetAvailable).toBe(false);
  const guest=await request("");expect(guest.status).toBe(401);cache(guest);
  const bad=await request("A","?cursor=INVALID_CURSOR!");
  expect(bad.status).toBe(400);cache(bad);
  expect((await bad.json()).code).toBe("VALIDATION_ERROR");
 });
 it("SQL denial gives masked500; runtime cannot mark read/write",async()=>{
  const before=await admin.feedNotification.findMany({
   where:{id:{in:[N_A,N_B,N_PUSH,N_HIDDEN]}},select:{readAt:true}});
  expect(before.every(row=>row.readAt===null)).toBe(true);
  await admin.$executeRawUnsafe('REVOKE SELECT ON "FeedNotification" FROM ag1_stats135_read');
  try{
   const error=await request("A");expect(error.status).toBe(500);cache(error);
   const body=JSON.stringify(await error.json());
   expect(body).not.toContain("permission denied");
  }finally{
   await admin.$executeRawUnsafe('GRANT SELECT ON "FeedNotification" TO ag1_stats135_read');
  }
  expect((await request("A")).status).toBe(200);
  const after=await admin.feedNotification.findMany({
   where:{id:{in:[N_A,N_B,N_PUSH,N_HIDDEN]}},select:{readAt:true}});
  expect(after.every(row=>row.readAt===null)).toBe(true);
 });
});
