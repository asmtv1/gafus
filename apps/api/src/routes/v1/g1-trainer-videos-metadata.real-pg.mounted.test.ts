/** AG1 G1 one NEW real registered Hono → Prisma → isolated PostgreSQL videos READ. */
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
// Existing missing NextAuth adapter is irrelevant to bearer JWT; no auth rewrite.
vi.mock("@gafus/auth",()=>({InvalidPasswordResetTokenError:class extends Error{}}));
vi.mock("@gafus/core/services/auth",async original=>({
 ...await original<object>(),isRegistrationCompleted:async()=>true,
}));
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";
const tag="ag1_video_meta_sql_"+randomBytes(5).toString("hex")+"_";
const names=["A","B","EMPTY","ADMIN","MOD","USER","PARTNER"] as const;
const roles=["TRAINER","TRAINER","TRAINER","ADMIN","MODERATOR","USER","PARTNER"] as const;
const actors=Object.fromEntries(names.map((name,i)=>[name,{
 id:tag+name,username:tag+name.toLowerCase(),role:roles[i],
}])) as Record<typeof names[number],{id:string;username:string;role:UserRole}>;
const tokens:Record<string,string>={};
const ADMIN_URL=process.env.G1_AG1_VIDEO_META_ADMIN_URL??"";
const admin=new PrismaClient({datasources:{db:{url:ADMIN_URL}}});
const PATH="/api/v1/trainer/videos/metadata";
const send=(name:string,url=PATH)=>app.request(url,{
 headers:name?{Authorization:"Bearer "+tokens[name]}:{},
});
const privacy=(response:Response)=>{
 expect(response.headers.get("cache-control")).toContain("private");
 expect(response.headers.get("cache-control")).toContain("no-store");
 expect(response.headers.get("referrer-policy")).toBe("no-referrer");
};
const publicKeys=["createdAt","displayName","durationSec","id","transcodingStatus"];
let connected=false;
beforeAll(async()=>{
 if(process.env.G1_AG1_OWN_PG!=="1")throw Error("REFUSE_NOT_OPTED_IN");
 for(const [url,role] of [[process.env.DATABASE_URL??"","ag1_stats135_read"],
  [ADMIN_URL,"ag1_course"]] as const){
  if(!url.includes("postgresql://"+role+"@")||
   !url.includes("/ag1_stats135?")||!url.includes(".ag1-course-pg/sock"))
   throw Error("REFUSE_NONOWNED_VIDEO_DATABASE");
 }
 process.env.JWT_SECRET=randomBytes(48).toString("hex");
 await admin.$connect();connected=true;
 const perms=await prisma.$queryRaw<{sel:boolean;ins:boolean;upd:boolean;del:boolean}[]>`
  SELECT has_table_privilege(current_user,'public."TrainerVideo"','SELECT') AS sel,
   has_table_privilege(current_user,'public."TrainerVideo"','INSERT') AS ins,
   has_table_privilege(current_user,'public."TrainerVideo"','UPDATE') AS upd,
   has_table_privilege(current_user,'public."TrainerVideo"','DELETE') AS del`;
 expect(perms).toEqual([{sel:true,ins:false,upd:false,del:false}]);
 for(const name of names){
  const actor=actors[name];tokens[name]=await generateAccessToken(actor);
  await admin.user.create({data:{id:actor.id,username:actor.username,role:actor.role,
   password:"isolated-video-test-only",email:actor.username+"@example.invalid"}});
 }
 // Mandatory schema fields are empty values: NO paths, URLs, files or media fixtures.
 for(const [id,owner,status,display,duration,created] of [
  ["a1","A","COMPLETED","A newest",25,"2032-08-04T12:00:00Z"],
  ["a2","A","PROCESSING",null,null,"2032-08-02T12:00:00Z"],
  ["b1","B","FAILED","B video",0,"2032-08-03T12:00:00Z"],
  ["d1","ADMIN","PENDING",null,null,"2032-08-05T12:00:00Z"],
 ] as const){
  await admin.trainerVideo.create({data:{id:tag+id,trainerId:actors[owner].id,
   relativePath:"",originalName:"",mimeType:"",fileSize:0n,
   transcodingStatus:status,displayName:display,durationSec:duration,
   createdAt:new Date(created)}});
 }
},90000);
afterAll(async()=>{
 try{if(connected){
  await admin.trainerVideo.deleteMany({where:{id:{startsWith:tag}}});
  await admin.user.deleteMany({where:{id:{startsWith:tag}}});
 }}finally{await prisma.$disconnect();await admin.$disconnect();}
},90000);
describe("AG1 Trainer videos five-field metadata REAL Prisma/own SQL",()=>{
 it("TRAINER A/B/A owner, date DESC, four statuses and nullable values",async()=>{
  for(const who of ["A","B","A"] as const){
   const r=await send(who);expect(r.status).toBe(200);privacy(r);
   const json=await r.json();const rows=json.data.videos;
   expect(rows.map((v:{id:string})=>v.id)).toEqual(who==="A"
    ?[tag+"a1",tag+"a2"]:[tag+"b1"]);
   expect(rows.map((v:{transcodingStatus:string})=>v.transcodingStatus)).toEqual(
    who==="A"?["COMPLETED","PROCESSING"]:["FAILED"]);
   expect(rows.map((v:{durationSec:number|null})=>v.durationSec)).toEqual(
    who==="A"?[25,null]:[0]);
   for(const row of rows){
    expect(Object.keys(row).sort()).toEqual(publicKeys);
    expect(row.createdAt).toMatch(/^2032-08-\d{2}T12:00:00\.000Z$/);
   }
   const serial=JSON.stringify(json);
   for(const key of ["relativePath","hlsManifestPath","thumbnailPath",
    "transcodingError","mimeType","fileSize","originalName","trainerId","title"])
    expect(serial).not.toContain(key);
  }
 });
 it("ADMIN sees all actors, including PENDING; TRAINER EMPTY sees empty",async()=>{
  const r=await send("ADMIN");expect(r.status).toBe(200);privacy(r);
  const rows=(await r.json()).data.videos as {
   id:string;transcodingStatus:string;displayName:string|null
  }[];
  const scoped=rows.filter(v=>v.id.startsWith(tag));
  expect(scoped.map(v=>v.id)).toEqual([tag+"d1",tag+"a1",tag+"b1",tag+"a2"]);
  expect(scoped[0]).toMatchObject({transcodingStatus:"PENDING",displayName:null});
  const empty=await send("EMPTY");expect(empty.status).toBe(200);privacy(empty);
  expect((await empty.json()).data).toEqual({videos:[]});
 });
 it("MOD/USER/PARTNER forbidden, guest unauthorized, no owner override",async()=>{
  for(const who of ["MOD","USER","PARTNER"]){
   const response=await send(who);expect(response.status).toBe(403);privacy(response);
  }
  const guest=await send("");expect(guest.status).toBe(401);privacy(guest);
  for(const query of ["?trainerId="+actors.B.id,"?admin=true","?page=1"]){
   const r=await send("A",PATH+query);expect(r.status).toBe(400);privacy(r);
  }
 });
 it("READ user has no insert/update/delete and privilege failure masks 500",async()=>{
  const check=await prisma.$queryRaw<{insert:boolean;update:boolean;del:boolean}[]>`
   SELECT has_table_privilege(current_user,'public."TrainerVideo"','INSERT') AS insert,
    has_table_privilege(current_user,'public."TrainerVideo"','UPDATE') AS update,
    has_table_privilege(current_user,'public."TrainerVideo"','DELETE') AS del`;
  expect(check).toEqual([{insert:false,update:false,del:false}]);
  await admin.$executeRawUnsafe('REVOKE SELECT ON "TrainerVideo" FROM ag1_stats135_read');
  try{
   const failed=await send("A");expect(failed.status).toBe(500);privacy(failed);
   const payload=JSON.stringify(await failed.json());
   expect(payload).not.toContain("permission denied");
  }finally{
   await admin.$executeRawUnsafe('GRANT SELECT ON "TrainerVideo" TO ag1_stats135_read');
  }
  const restored=await send("A");expect(restored.status).toBe(200);privacy(restored);
 });
});
