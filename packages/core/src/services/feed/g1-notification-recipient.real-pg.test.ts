/** New independent AG1/AG2 Feed notification owner SQL boundary, no Hono/NextAuth. */
import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../../../prisma/node_modules/@prisma/client";
import { prisma } from "@gafus/prisma";
import { createFeedSocial } from "./social";

const marker = randomBytes(6).toString("hex");
const tag = "ag1notice_" + marker + "_";
const uid = (kind:string) => "c" + (marker + kind).padEnd(24, "0").slice(0,24);
const users = {A:uid("recipientA"), B:uid("recipientB"), ACTOR:uid("actor")};
const posts = {visible:uid("postvis"), deleted:uid("postdel"),
  moderated:uid("postmod"), draft:uid("postdraft")};
const notices = {newest:uid("nnew"), moderated:uid("nmod"),
  deleted:uid("ndel"), draft:uid("ndraft"), older:uid("nold"),
  push:uid("npush"), foreign:uid("nforeign")};
const adminUrl=process.env.G1_AG1_NOTICE_ADMIN_URL??"";
const admin=new PrismaClient({datasources:{db:{url:adminUrl}}});
const reader=createFeedSocial({db:prisma,enabled:()=>true,
  now:()=>new Date("2033-01-01T00:00:00.000Z")});
const publicColumns=["actorCount","actors","commentId","createdAt","id","kind",
  "postId","reaction","readAt","targetAvailable"];
const madeUsers=Object.values(users);
const madePosts=Object.values(posts);
const madeNotices=Object.values(notices);
let dbConnected=false;
const date=(day:number)=>new Date(`2032-09-${String(day).padStart(2,"0")}T12:00:00.000Z`);
beforeAll(async()=>{
 if(process.env.G1_AG1_OWN_PG!=="1")throw Error("REFUSE_AG1_OWNPG_OPT_IN_REQUIRED");
 for(const [connection,role] of [[process.env.DATABASE_URL??"","ag1_stats135_read"],
  [adminUrl,"ag1_course"]] as const){
  if(!connection.includes("postgresql://"+role+"@")||
     !connection.includes("/ag1_stats135?")||
     !connection.includes(".ag1-course-pg/sock"))
   throw Error("REFUSE_EXTERNAL_FEED_DATABASE");
 }
 await admin.$connect();dbConnected=true;
 const rights=await prisma.$queryRaw<{sel:boolean;ins:boolean;upd:boolean;del:boolean}[]>`
  SELECT has_table_privilege(current_user,'public."FeedNotification"','SELECT') AS sel,
   has_table_privilege(current_user,'public."FeedNotification"','INSERT') AS ins,
   has_table_privilege(current_user,'public."FeedNotification"','UPDATE') AS upd,
   has_table_privilege(current_user,'public."FeedNotification"','DELETE') AS del`;
 expect(rights).toEqual([{sel:true,ins:false,upd:false,del:false}]);
 for(const [name,id] of Object.entries(users))await admin.user.create({data:{id,
  username:tag+name.toLowerCase(),email:tag+name.toLowerCase()+"@example.invalid",
  role:"USER",password:"synthetic-disabled-login"}});
 for(const [name,id] of Object.entries(posts)){
  await admin.feedPost.create({data:{id,authorId:users.A,
   clientRequestId:tag+name,
   status:name==="draft"?"draft":"published",
   moderationState:name==="moderated"?"hidden":"visible",
   deletedAt:name==="deleted"?date(4):null,
   publishedAt:name==="draft"?null:date(1)}});
 }
 const records=[
  ["newest","A","visible","comment",7],
  ["moderated","A","moderated","reply",6],
  ["deleted","A","deleted","post_reaction",5],
  ["draft","A","draft","comment",4],
  ["older","A","visible","comment_reaction",3],
  ["push","A","visible","author_post",8],
  ["foreign","B","visible","comment",9],
 ] as const;
 for(const [key,to,post,kind,day] of records){
  await admin.feedNotification.create({data:{id:notices[key],recipientId:users[to],
   postId:posts[post],kind,actorIds:[users.ACTOR],createdAt:date(day)}});
 }
},90000);
afterAll(async()=>{
 try{if(dbConnected){
  await admin.feedNotification.deleteMany({where:{id:{in:madeNotices}}});
  await admin.feedPost.deleteMany({where:{id:{in:madePosts}}});
  await admin.user.deleteMany({where:{id:{in:madeUsers}}});
 }}finally{await prisma.$disconnect();await admin.$disconnect();}
},90000);
describe("actual createFeedSocial Notifications → Prisma → AG1 isolated SQL",()=>{
 it("A and B have disjoint recipient SQL results, author_post push-only excluded",async()=>{
  for(const who of ["A","B","A"] as const){
   const page=await reader.listNotifications(users[who]);
   expect(page.items.map(n=>n.id)).toEqual(who==="A"
    ?[notices.newest,notices.moderated,notices.deleted,notices.draft,notices.older]
    :[notices.foreign]);
   expect(page.items.every(n=>n.id!==notices.push)).toBe(true);
   expect(page.items.every(n=>n.actorCount===1)).toBe(true);
  }
 });
 it("visibility flags represent published, moderated, deleted and draft",async()=>{
  const page=await reader.listNotifications(users.A);
  const values=Object.fromEntries(page.items.map(n=>[n.id,n.targetAvailable]));
  expect(values).toMatchObject({
   [notices.newest]:true,[notices.moderated]:false,[notices.deleted]:false,
   [notices.draft]:false,[notices.older]:true,
  });
  for(const notice of page.items){
   expect(Object.keys(notice).sort()).toEqual(publicColumns);
   expect(notice.actors).toEqual([{
    id:users.ACTOR,username:tag+"actor",name:tag+"actor",avatarUrl:null,
   }]);
   const json=JSON.stringify(notice);
   for(const hidden of ["email","password","moderationReason","deletedAt",
    "clientRequestId","mediaUrl","relativePath"])
    expect(json).not.toContain(hidden);
  }
 });
 it("cursor pages across timestamp/ID ordering; isolation on B after A",async()=>{
  const first=await reader.listNotifications(users.A,{pageSize:2});
  expect(first.items.map(n=>n.id)).toEqual([notices.newest,notices.moderated]);
  expect(first.nextCursor).toBeTruthy();
  const second=await reader.listNotifications(users.A,{pageSize:2,cursor:first.nextCursor});
  expect(second.items.map(n=>n.id)).toEqual([notices.deleted,notices.draft]);
  expect(second.nextCursor).toBeTruthy();
  const third=await reader.listNotifications(users.A,{pageSize:2,cursor:second.nextCursor});
  expect(third.items.map(n=>n.id)).toEqual([notices.older]);
  expect(third.nextCursor).toBeNull();
  const foreign=await reader.listNotifications(users.B,{pageSize:2,cursor:first.nextCursor});
  expect(foreign.items).toEqual([]);
  expect(foreign.nextCursor).toBeNull();
 });
 it("empty valid actor vs unavailable identity, invalid cursor is validated",async()=>{
  expect((await reader.listNotifications(users.A,{pageSize:1,
   cursor:Buffer.from(JSON.stringify([date(1).toISOString(),uid("none")])).toString("base64url"),
  })).items).toEqual([]);
  await expect(reader.listNotifications(uid("unknown")))
   .rejects.toMatchObject({code:"UNAUTHENTICATED",status:401});
  await expect(reader.listNotifications(users.A,{cursor:"bad-%%"}))
   .rejects.toMatchObject({code:"VALIDATION_ERROR",status:400});
 });
 it("GET never mutates FeedNotification or readAt in real SQL",async()=>{
  const count=await admin.feedNotification.count({where:{id:{in:madeNotices}}});
  expect(count).toBe(7);
  const all=await admin.feedNotification.findMany({where:{id:{in:madeNotices}},
   select:{readAt:true,actorIds:true}});
  expect(all.every(n=>n.readAt===null&&n.actorIds.length===1)).toBe(true);
  const rows=await prisma.$queryRaw<{select_ok:boolean;write_ok:boolean}[]>`
   SELECT has_table_privilege(current_user,'public."FeedPost"','SELECT') AS select_ok,
   has_table_privilege(current_user,'public."FeedPost"','UPDATE') AS write_ok`;
  expect(rows).toEqual([{select_ok:true,write_ok:false}]);
 });
});
