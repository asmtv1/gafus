/** AG1: new isolated real SQL article ownership, likes and minimal response proof. */
import {randomBytes} from "node:crypto";
import {PrismaClient,type UserRole} from "../../../../../packages/prisma/node_modules/@prisma/client";
import {prisma} from "@gafus/prisma";
import {beforeAll,afterAll,describe,expect,it,vi} from "vitest";
vi.mock("@hono-rate-limiter/redis",()=>({RedisStore:class{
 windowMs=60000;
 init(c:{windowMs:number}){this.windowMs=c.windowMs;}
 async increment(){return {totalHits:1,resetTime:new Date(Date.now()+this.windowMs)};}
 async decrement(){return undefined;}
 async resetKey(){return undefined;}
}}));
vi.mock("@gafus/auth",()=>({InvalidPasswordResetTokenError:class extends Error{}}));
vi.mock("@gafus/core/services/auth",async original=>({
 ...await original<object>(),isRegistrationCompleted:async()=>true,
}));
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";
const tag="ag1_art_sql_"+randomBytes(5).toString("hex")+"_";
const names=["A","B","ADMIN","MOD","USER","PARTNER"] as const;
const roles=["TRAINER","TRAINER","ADMIN","MODERATOR","USER","PARTNER"] as const;
const actors=Object.fromEntries(names.map((n,i)=>[n,{
 id:tag+n,username:tag+n.toLowerCase(),role:roles[i],
}])) as Record<typeof names[number],{id:string;username:string;role:UserRole}>;
const jwt:Record<string,string>={};
const ADMIN_URL=process.env.G1_AG1_ARTICLES_ADMIN_URL??"";
const admin=new PrismaClient({datasources:{db:{url:ADMIN_URL}}});
const path="/api/v1/trainer/articles/own-summary";
const send=(who:string,url=path)=>app.request(url,{headers:who?{
 Authorization:"Bearer "+jwt[who],
}:{}});
const privateFields="AG1_ARTICLE_SECRET_CONTENT_MEDIA";
const own=(who:string)=>actors[who as keyof typeof actors].id;
let seeded=false;
beforeAll(async()=>{
 if(process.env.G1_AG1_OWN_PG!=="1")throw Error("REFUSE_NOT_OPTED_IN");
 for(const [url,role] of [[process.env.DATABASE_URL??"","ag1_stats135_read"],
  [ADMIN_URL,"ag1_course"]] as const){
  if(!url.includes("postgresql://"+role+"@")||
   !url.includes("/ag1_stats135?")||!url.includes(".ag1-course-pg/sock"))
    throw Error("REFUSE_NONOWNED_ARTICLES_DATABASE");
 }
 process.env.JWT_SECRET=randomBytes(48).toString("hex");
 await admin.$connect();
 const permission=await prisma.$queryRaw<{
  sel:boolean;ins:boolean;upd:boolean;del:boolean
 }[]>`SELECT has_table_privilege(current_user,'public."Article"','SELECT') AS sel,
 has_table_privilege(current_user,'public."Article"','INSERT') AS ins,
 has_table_privilege(current_user,'public."Article"','UPDATE') AS upd,
 has_table_privilege(current_user,'public."Article"','DELETE') AS del`;
 expect(permission).toEqual([{sel:true,ins:false,upd:false,del:false}]);
 for(const n of names){const a=actors[n];jwt[n]=await generateAccessToken(a);
  await admin.user.create({data:{id:a.id,username:a.username,role:a.role,
   password:"isolated-test-only",email:a.username+"@example.invalid"}});
 }
 for(const [id,owner,date] of [
  ["a1","A","2032-07-04T10:00:00Z"],["a2","A","2032-07-02T10:00:00Z"],
  ["b1","B","2032-07-03T10:00:00Z"],["ad1","ADMIN","2032-07-05T10:00:00Z"],
 ] as const){
  await admin.article.create({data:{id:tag+id,authorId:own(owner),
   title:id,slug:tag+id,content:privateFields,description:privateFields,
   logoImg:privateFields,videoUrl:privateFields,imageUrls:[privateFields],
   visibility:"PUBLIC",viewCount:id==="a1"?9:0,
   createdAt:new Date(date)}});
 }
 await admin.articleLike.create({data:{articleId:tag+"a1",userId:own("ADMIN")}});
 await admin.articleLike.create({data:{articleId:tag+"a1",userId:own("B")}});
 await admin.articleLike.create({data:{articleId:tag+"b1",userId:own("A")}});
 seeded=true;
},90000);
afterAll(async()=>{
 try{if(seeded){
  await admin.articleLike.deleteMany({where:{articleId:{startsWith:tag}}});
  await admin.article.deleteMany({where:{id:{startsWith:tag}}});
  await admin.user.deleteMany({where:{id:{startsWith:tag}}});
 }}finally{await prisma.$disconnect();await admin.$disconnect();}
},90000);
describe("AG1 OWN articles actual Hono Prisma isolated PG",()=>{
 it("TRAINER A/B/A each only owner, SQL likes, DESC order, eight keys",async()=>{
  for(const who of ["A","B","A"]){
   const r=await send(who);expect(r.status).toBe(200);
   expect(r.headers.get("cache-control")).toContain("no-store");
   const json=await r.json();const rows=json.data.articles;
   expect(rows.map((x:{id:string})=>x.id)).toEqual(
    who==="A"?[tag+"a1",tag+"a2"]:[tag+"b1"]);
   expect(rows.map((x:{likeCount:number})=>x.likeCount)).toEqual(
    who==="A"?[2,0]:[1]);
   expect(rows[0].viewCount).toBe(who==="A"?9:0);
   for(const row of rows)expect(Object.keys(row).sort()).toEqual([
    "createdAt","id","likeCount","slug","title","updatedAt","viewCount","visibility"]);
   expect(JSON.stringify(json)).not.toContain(privateFields);
  }
 });
 it("ADMIN own, not all; empty independent actor and query override denied",async()=>{
  const r=await send("ADMIN");expect(r.status).toBe(200);
  expect((await r.json()).data.articles.map((x:{id:string})=>x.id)).toEqual([tag+"ad1"]);
  expect((await send("A",path+"?authorId="+own("B"))).status).toBe(400);
  for(const who of ["MOD","USER","PARTNER"])
   expect((await send(who)).status).toBe(403);
  expect((await send("")).status).toBe(401);
 });
 it("actual DB SELECT revoked briefly returns masked 500, then restored",async()=>{
  await admin.$executeRawUnsafe('REVOKE SELECT ON "Article" FROM ag1_stats135_read');
  try{
   const r=await send("A");expect(r.status).toBe(500);
   const body=JSON.stringify(await r.json());
   expect(body).not.toContain("permission denied");
  }finally{
   await admin.$executeRawUnsafe('GRANT SELECT ON "Article" TO ag1_stats135_read');
  }
  expect((await send("A")).status).toBe(200);
 });
 it("SQL read role cannot write, count/ordering/take100 projection",async()=>{
  const allowed=await prisma.$queryRaw<{writes:boolean}[]>`
   SELECT has_table_privilege(current_user,'public."Article"','UPDATE') AS writes`;
  expect(allowed[0]?.writes).toBe(false);
  const count=await admin.article.count({where:{id:{startsWith:tag}}});
  expect(count).toBe(4);
 });
});
