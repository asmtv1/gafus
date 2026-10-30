/**
 * G1 ADMIN GAFUS existing registered Hono -> actual Core -> actual Prisma ->
 * isolated PG 14.19 FULL schema. Production/other DBs are NEVER accessed.
 * Runtime Prisma role SELECT-only; fixture seeding uses separate privileged
 * client scoped to this owned scratch DB. No Core or Prisma mocks.
 */
import {randomBytes} from "node:crypto";
import {PrismaClient, type UserRole} from
 "../../../../../packages/prisma/node_modules/@prisma/client";
import {prisma} from "@gafus/prisma";
import {beforeAll,afterAll,describe,expect,it,vi} from "vitest";
const limiter=vi.hoisted(()=>({keys:[] as string[]}));
vi.mock("@hono-rate-limiter/redis",()=>({
 RedisStore:class {
  windowMs=60000;
  init(config:{windowMs:number}){this.windowMs=config.windowMs;}
  async increment(key:string){
   limiter.keys.push(key);
   return {totalHits:1,resetTime:new Date(Date.now()+this.windowMs)};
  }
  async decrement(){return undefined;}
  async resetKey(){return undefined;}
 },
}));
vi.mock("@gafus/core/services/auth",async original=>({
 ...await original<object>(),isRegistrationCompleted:async()=>true,
}));
// NO mock of Core adminGafus, @gafus/prisma or actual SQL operations.
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";
import {getGafusAdminDashboard} from "@gafus/core/services/adminGafus";

const tag="ag1_dashboard_sql_"+randomBytes(4).toString("hex")+"_";
const id=(label:string)=>tag+label;
const actors={
 ADMIN:{id:id("admin"),username:id("adminname"),role:"ADMIN"},
 TRAINER:{id:id("trainer"),username:id("trainername"),role:"TRAINER"},
 MOD:{id:id("mod"),username:id("modname"),role:"MODERATOR"},
 USER:{id:id("user"),username:id("username"),role:"USER"},
 PARTNER:{id:id("partner"),username:id("partnername"),role:"PARTNER"},
} as const;
const authTokens:Record<string,string>={};
const PATH="/api/v1/gafus/admin/dashboard";
const READROLE="ag1_gafus134_read";
const adminUrl=process.env.G1_AG1_GAFUS_ADMIN_URL??"";
const seeded=new PrismaClient({datasources:{db:{url:adminUrl}}});
const SECRET="PRIVATE-WALLET-NOTES-EMAIL-FRAUD-METADATA-DO-NOT-LEAK";
const send=(who:string)=>app.request(PATH,{
 method:"GET",
 headers:who?{authorization:"Bearer "+(authTokens[who]??who)}:{},
});
function privacy(response:Response){
 const cache=(response.headers.get("cache-control")??"").toLowerCase();
 expect(cache).toContain("no-store");
 expect(cache).toContain("private");
 expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}
const settingsKeys=[
 "accessDurationSeconds","activityLimit","activityWindowSeconds",
 "answerReward","bestAnswerReward","courseStepCost","earningEnabled",
 "economyEnabled","miniGuideCost","postReward","questionReward",
 "reactionReward","reactionThreshold","revision","spendingEnabled",
];
const expectedKinds=["ADMIN_CREDIT","EARN","SPEND"];
async function dashboard(){
 const response=await send("ADMIN");
 expect(response.status).toBe(200);privacy(response);
 const json=await response.json() as {success:boolean;data:{
  settings:Record<string,unknown>,
  wallets:{count:number;outstanding:number},
  transactions:{kind:string;_sum:{delta:number|null};_count:{_all:number}}[],
  fraudOpen:number,
 }};
 expect(Object.keys(json).sort()).toEqual(["data","success"]);
 expect(json.success).toBe(true);
 expect(Object.keys(json.data).sort())
  .toEqual(["fraudOpen","settings","transactions","wallets"]);
 expect(Object.keys(json.data.settings).sort()).toEqual(settingsKeys);
 expect(Object.keys(json.data.wallets).sort()).toEqual(["count","outstanding"]);
 for(const group of json.data.transactions){
  expect(Object.keys(group).sort()).toEqual(["_count","_sum","kind"]);
  expect(Object.keys(group._sum)).toEqual(["delta"]);
  expect(Object.keys(group._count)).toEqual(["_all"]);
 }
 expect(JSON.stringify(json)).not.toContain(SECRET);
 expect(JSON.stringify(json)).not.toContain("@example.invalid");
 return json.data;
}
async function grantRightsCheck(){
 const rights=await prisma.$queryRaw<
  {role:string;walletRead:boolean;walletWrite:boolean;transactionWrite:boolean;
   fraudWrite:boolean;settingsWrite:boolean}[]
 >`
  SELECT current_user::text AS role,
   has_table_privilege(current_user,'public."GafusWallet"','SELECT') AS "walletRead",
   has_table_privilege(current_user,'public."GafusWallet"','INSERT') AS "walletWrite",
   has_table_privilege(current_user,'public."GafusTransaction"','INSERT') AS "transactionWrite",
   has_table_privilege(current_user,'public."GafusFraudSignal"','UPDATE') AS "fraudWrite",
   has_table_privilege(current_user,'public."GafusSettings"','UPDATE') AS "settingsWrite"
 `;
 expect(rights).toEqual([{role:READROLE,walletRead:true,walletWrite:false,
  transactionWrite:false,fraudWrite:false,settingsWrite:false}]);
}
beforeAll(async()=>{
 const database=process.env.DATABASE_URL??"";
 if(process.env.G1_AG1_OWN_PG!=="1" ||
  !database.includes(READROLE+"@") ||
  !database.includes("/ag1_gafus134?") ||
  !database.includes(".ag1-course-pg/sock") ||
  !adminUrl.includes("ag1_course@") ||
  !adminUrl.includes("/ag1_gafus134?") ||
  !adminUrl.includes(".ag1-course-pg/sock"))
  throw Error("REFUSE_OTHER_DATABASE_OR_NONREADONLY_ROLE");
 process.env.JWT_SECRET=randomBytes(48).toString("hex");
 await seeded.$connect();
 await grantRightsCheck();
 for(const [who,actor] of Object.entries(actors)){
  authTokens[who]=await generateAccessToken(actor);
  await seeded.user.create({data:{
   id:actor.id,username:actor.username,role:actor.role as UserRole,
   password:SECRET,email:actor.username+"@example.invalid",
  }});
 }
},60000);
afterAll(async()=>{await prisma.$disconnect();await seeded.$disconnect();});
describe("G1 ADMIN dashboard ACTUAL registered Hono Core Prisma full-schema PG",()=>{
 it("Core unmocked; empty SQL aggregate/groupBy/count and default settings",async()=>{
  expect(typeof getGafusAdminDashboard).toBe("function");
  const result=await dashboard();
  expect(result.settings).toMatchObject({
   revision:1,economyEnabled:true,earningEnabled:true,
   spendingEnabled:true,activityLimit:3,
  });
  expect(result.wallets).toEqual({count:0,outstanding:0});
  expect(result.transactions).toEqual([]);
  expect(result.fraudOpen).toBe(0);
 });
 it("non-ADMIN roles 403, guest401, prior to any admin aggregates",async()=>{
  for(const who of ["TRAINER","MOD","USER","PARTNER"]){
   const r=await send(who);
   expect(r.status).toBe(403);privacy(r);
   expect(await r.json()).toMatchObject({success:false,code:"FORBIDDEN"});
  }
  const guest=await send("");
  expect(guest.status).toBe(401);privacy(guest);
  const denied=await guest.json() as Record<string,unknown>;
  expect(JSON.stringify(denied)).not.toContain(SECRET);
 });
 it("actual SQL aggregate/groupBy/count and saved revision/switches",async()=>{
  await seeded.gafusSettings.create({data:{
   key:"default",revision:7,economyEnabled:true,
   earningEnabled:false,spendingEnabled:true,
   postReward:2,questionReward:3,answerReward:4,
   activityLimit:5,activityWindowSeconds:7200,
   reactionThreshold:11,reactionReward:6,bestAnswerReward:8,
   courseStepCost:2,miniGuideCost:3,accessDurationSeconds:1209600,
   updatedById:actors.ADMIN.id,
  }});
  for(const [who,balance] of [
   ["TRAINER",7],["USER",0],["MOD",13],
  ] as const){
   await seeded.gafusWallet.create({
    data:{userId:actors[who].id,balance},
   });
  }
  const txSpecs=[
   {kind:"EARN" as const,user:"TRAINER" as const,delta:12},
   {kind:"EARN" as const,user:"TRAINER" as const,delta:9},
   {kind:"SPEND" as const,user:"USER" as const,delta:-3},
   {kind:"SPEND" as const,user:"MOD" as const,delta:-2},
   {kind:"ADMIN_CREDIT" as const,user:"MOD" as const,delta:6},
  ];
  for(const [index,entry] of txSpecs.entries()){
   await seeded.gafusTransaction.create({data:{
    id:id("transaction_"+index),userId:actors[entry.user].id,
    kind:entry.kind,delta:entry.delta,
    balanceBefore:0,balanceAfter:0,
    idempotencyKey:id("receipt_"+index),
    reason:SECRET,metadata:{privateNotes:SECRET},
   }});
  }
  for(const [i,status] of ["OPEN","OPEN","RESOLVED","DISMISSED"].entries()){
   await seeded.gafusFraudSignal.create({data:{
    id:id("fraud_"+i),userId:actors.USER.id,
    status:status as "OPEN"|"RESOLVED"|"DISMISSED",
    severity:"LOW",kind:"SYNTHETIC_TEST",metadata:{secret:SECRET},
   }});
  }
  // The persisted legacy tariff knobs may still carry older custom values.
  // Current GAFUS product rules FIX all content to one Gafus / seven days.
  const stored=await seeded.gafusSettings.findUnique({where:{key:"default"}});
  expect(stored).toMatchObject({
   revision:7,courseStepCost:2,accessDurationSeconds:1209600,
  });
  const result=await dashboard();
  expect(result.settings).toMatchObject({
   revision:7,earningEnabled:false,postReward:2,activityLimit:5,
   courseStepCost:1,miniGuideCost:1,accessDurationSeconds:604800,
  });
  expect(result.wallets).toEqual({count:3,outstanding:20});
  const kinds=result.transactions.map(x=>x.kind).sort();
  expect(kinds).toEqual(expectedKinds);
  const byKind=Object.fromEntries(result.transactions.map(g=>[g.kind,g]));
  expect(byKind.EARN).toMatchObject({_count:{_all:2},_sum:{delta:21}});
  expect(byKind.SPEND).toMatchObject({_count:{_all:2},_sum:{delta:-5}});
  expect(byKind.ADMIN_CREDIT).toMatchObject({_count:{_all:1},_sum:{delta:6}});
  expect(result.fraudOpen).toBe(2);
 });
 it("real SQL SELECT denial becomes masked500 rather than empty/zero-success",async()=>{
  await seeded.$executeRawUnsafe(
   'REVOKE SELECT ON "GafusWallet" FROM "'+READROLE+'"');
  try {
   const r=await send("ADMIN");
   expect(r.status).toBe(500);privacy(r);
   const value=await r.json() as Record<string,unknown>;
   expect(value).toEqual({success:false,code:"GAFUS_INTERNAL_ERROR"});
   expect(JSON.stringify(value)).not.toContain("permission denied");
   expect(JSON.stringify(value)).not.toContain(SECRET);
  }finally{
   await seeded.$executeRawUnsafe(
    'GRANT SELECT ON "GafusWallet" TO "'+READROLE+'"');
  }
  expect((await dashboard()).wallets).toEqual({count:3,outstanding:20});
 });
 it("actual read role cannot mutate and all seeded counts stay fixed",async()=>{
  await grantRightsCheck();
  expect(await seeded.gafusWallet.count()).toBe(3);
  expect(await seeded.gafusTransaction.count()).toBe(5);
  expect(await seeded.gafusFraudSignal.count()).toBe(4);
  expect(await seeded.gafusAdminAudit.count()).toBe(0);
  expect(await seeded.gafusSettingsRevision.count()).toBe(0);
 });
});
