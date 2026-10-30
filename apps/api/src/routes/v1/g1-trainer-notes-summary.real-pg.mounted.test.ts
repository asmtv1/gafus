/** One NEW G1 Notes SQL acceptance; never points to shared PostgreSQL. */
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
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(),isRegistrationCompleted:async()=>true,
}));
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";
const tag="ag1_notes_sql_"+randomBytes(5).toString("hex")+"_";
const names=["A","B","MOD","ADMIN","USER","PARTNER"] as const;
const roles=["TRAINER","TRAINER","MODERATOR","ADMIN","USER","PARTNER"] as const;
const actors=Object.fromEntries(names.map((name,i)=>[name,{
 id:tag+name,username:tag+name.toLowerCase(),role:roles[i],
}])) as Record<typeof names[number],{id:string;username:string;role:UserRole}>;
const tokens:Record<string,string>={};
const ADMIN_URL=process.env.G1_AG1_NOTES_ADMIN_URL??"";
const admin=new PrismaClient({datasources:{db:{url:ADMIN_URL}}});
const PATH="/api/v1/trainer/notes/summary";
const send=(name:string,query="")=>app.request(PATH+query,{
 headers:name?{Authorization:"Bearer "+tokens[name]}:{},
});
const read=async(name:string,query="")=>{
 const response=await send(name,query);
 expect(response.status).toBe(200);
 expect(response.headers.get("cache-control")).toContain("no-store");
 return (await response.json()).data;
};
let seeded=false;
beforeAll(async()=>{
 const url=process.env.DATABASE_URL??"";
 for(const [value,owner] of [[url,"ag1_stats135_read"],[ADMIN_URL,"ag1_course"]] as const){
  if(!value.includes("postgresql://"+owner+"@") ||
    !value.includes("/ag1_stats135?") ||
    !value.includes(".ag1-course-pg/sock"))throw Error("REFUSE_NONOWNED_NOTES_SQL");
 }
 if(process.env.G1_AG1_OWN_PG!=="1")throw Error("REFUSE_SQL_NOT_OPTED_IN");
 process.env.JWT_SECRET=randomBytes(48).toString("hex");
 await admin.$connect();
 const checks=await prisma.$queryRaw<{sel:boolean;ins:boolean;upd:boolean;del:boolean}[]>`
 SELECT has_table_privilege(current_user,'public."TrainerNote"','SELECT') AS sel,
 has_table_privilege(current_user,'public."TrainerNote"','INSERT') AS ins,
 has_table_privilege(current_user,'public."TrainerNote"','UPDATE') AS upd,
 has_table_privilege(current_user,'public."TrainerNote"','DELETE') AS del`;
 expect(checks).toEqual([{sel:true,ins:false,upd:false,del:false}]);
 for(const name of names){
  const a=actors[name];tokens[name]=await generateAccessToken(a);
  await admin.user.create({data:{id:a.id,username:a.username,role:a.role,
   password:"test-only-disabled",email:a.username+"@example.invalid"}});
 }
 for(const [id,owner,title,tags,date] of [
  ["a1","A","A title",["training"],"2032-06-03T12:00:00Z"],
  ["a2","A",null,[],"2032-06-02T12:00:00Z"],
  ["a3","A","Old",["day"],"2032-06-01T12:00:00Z"],
  ["b1","B","B title",["other"],"2032-06-04T12:00:00Z"],
  ["m1","MOD","M title",[],"2032-06-05T12:00:00Z"],
 ] as const){
  await admin.trainerNote.create({data:{id:tag+id,trainerId:actors[owner].id,
   title,tags:[...tags],createdAt:new Date(date)}});
 }
 seeded=true;
},90000);
afterAll(async()=>{
 try{
  if(seeded){
   await admin.trainerNote.deleteMany({where:{id:{startsWith:tag}}});
   await admin.user.deleteMany({where:{id:{startsWith:tag}}});
  }
 }finally{await prisma.$disconnect();await admin.$disconnect();}
},90000);
describe("AG1 Notes REAL signed Hono + Prisma/own PostgreSQL",()=>{
 it("A/B/A owner SQL scoped pagination and total stay consistent",async()=>{
  for(const who of ["A","B","A"]){
   const data=await read(who,"?page=0&pageSize=2");
   expect(data.total).toBe(who==="A"?3:1);
   expect(data.notes.map((n:{id:string})=>n.id)).toEqual(
    who==="A"?[tag+"a1",tag+"a2"]:[tag+"b1"]);
   expect(data.page).toBe(0);expect(data.pageSize).toBe(2);
  }
  const second=await read("A","?page=1&pageSize=2");
  expect(second.total).toBe(3);
  expect(second.notes.map((n:{id:string})=>n.id)).toEqual([tag+"a3"]);
 });
 it("ADMIN sees all / MOD only own, strict private projection",async()=>{
  const all=await read("ADMIN","?pageSize=50");
  const own=await read("MOD");
  expect(all.total).toBeGreaterThanOrEqual(5);
  expect(all.notes.filter((n:{id:string})=>n.id.startsWith(tag)).length).toBe(5);
  expect(own.notes.map((n:{id:string})=>n.id)).toEqual([tag+"m1"]);
  for(const note of all.notes){
   expect(Object.keys(note).sort()).toEqual(["createdAt","id","tags","title"]);
   expect(typeof note.createdAt).toBe("string");
  }
 });
 it("rejects impersonation and disallowed nonstaff/guest",async()=>{
  expect((await send("A","?trainerId="+actors.B.id)).status).toBe(400);
  for(const who of ["USER","PARTNER"]){expect((await send(who)).status).toBe(403);}
  expect((await send("")).status).toBe(401);
 });
 it("no matches is 200 with zero and no SQL write capacity",async()=>{
  const data=await read("B","?page=1000&pageSize=1");
  expect(data.notes).toEqual([]);expect(data.total).toBe(1);
  const state=await prisma.$queryRaw<{writes:boolean}[]>`
   SELECT has_table_privilege(current_user,'public."TrainerNote"','UPDATE') AS writes`;
  expect(state[0]?.writes).toBe(false);
 });
});
