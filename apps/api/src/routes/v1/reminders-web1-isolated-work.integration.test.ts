/** WEB1 registered Hono cookie -> real Core -> restricted WORK PostgreSQL.
 * Only newly created synthetic owner fixtures; no production database/provider.
 */
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { remindersRoutes } from "./reminders";
import { userRoutes } from "./user";
import { subscriptionsRoutes } from "./subscriptions";

const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const enabled=process.env.GAFUS_WEB1_ISOLATED_REMINDER_HONO_TEST==="1";
if(enabled){
  const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
  if(process.cwd()!==`${ROOT}/apps/api` || url.hostname!=="127.0.0.1" ||
      url.port!=="55921" || url.pathname!=="/gafus_refactor_real_work_20261024" ||
      url.username!=="gafus_refactor_local_real" || !url.password ||
      url.protocol!=="postgresql:" || url.search!=="?schema=public" ||
      process.env.GAFUS_LOCAL_BROWSER_AUTH!=="1" ||
      process.env.GAFUS_LOCAL_ISOLATED_API!=="1" ||
      process.env.API_HOST!=="127.0.0.1" ||process.env.API_PORT!=="3001")
    throw Error("DENIED: WEB1 local WORK PostgreSQL/Hono preflight failed");
}
const suite=enabled?describe:describe.skip;
const origin="http://127.0.0.1:5173";
const base="http://127.0.0.1:3001/api/v1/reminders";
const app=new Hono();
app.use("/api/v1/reminders",authMiddleware);
app.use("/api/v1/reminders/*",authMiddleware);
app.route("/api/v1/reminders",remindersRoutes);
app.use("/api/v1/user/*",authMiddleware);
app.route("/api/v1/user",userRoutes);
app.use("/api/v1/subscriptions/*",authMiddleware);
app.route("/api/v1/subscriptions",subscriptionsRoutes);
const payload=(name="WEB1 disposable")=>({name,reminderTime:"10:15",reminderDays:"1,3,5",timezone:"Etc/UTC"});
function invoke(
  path:string,method:string,cookie?:string,data?:unknown,key?:string,customOrigin=origin,
){
  const headers:Record<string,string>={
    ...(cookie?{cookie:`gafus_access=${cookie}`,"x-gafus-auth-transport":"cookie"}:{}),
    ...(method!=="GET"?{origin:customOrigin,"content-type":"application/json"}:{}),
    ...(key?{"idempotency-key":key}:{}),
  };
  return app.request(base+(path==="/"?"":path),{method,headers,...(data===undefined?{}:{body:JSON.stringify(data)})});
}
suite("WEB1 authenticated reminder Hono->Core->SQL isolated",()=>{
  let owner="",foreign="",token="",foreignToken="";
  beforeAll(async()=>{
    const identity=await prisma.$queryRaw<{db:string;actor:string}[]>`
      SELECT current_database() AS db,current_user AS actor`;
    expect(identity).toEqual([{db:"gafus_refactor_real_work_20261024",actor:"gafus_refactor_local_real"}]);
  });
  beforeEach(async()=>{
    owner=randomUUID();foreign=randomUUID();
    await prisma.user.createMany({data:[
      {id:owner,username:`web1_hono_${owner.replaceAll("-","")}`,password:randomUUID(),role:"USER",registrationPending:false},
      {id:foreign,username:`web1_hono_${foreign.replaceAll("-","")}`,password:randomUUID(),role:"USER",registrationPending:false},
    ]});
    token=await generateAccessToken({id:owner,username:`web1_hono_${owner.replaceAll("-","")}`,role:"USER"});
    foreignToken=await generateAccessToken({id:foreign,username:`web1_hono_${foreign.replaceAll("-","")}`,role:"USER"});
  });
  afterEach(async()=>{
    const ids=[owner,foreign];
    const users=await prisma.user.findMany({where:{id:{in:ids}},select:{id:true,username:true}});
    for(const user of users){
      if(user.username!==`web1_hono_${user.id.replaceAll("-","")}`)
        throw Error("DENIED: cleanup actor is not a WEB1 synthetic user");
    }
    await prisma.pushSubscription.deleteMany({where:{userId:{in:ids}}});
    await prisma.reminderMutationReceipt.deleteMany({where:{ownerUserId:{in:ids}}});
    await prisma.reminder.deleteMany({where:{userId:{in:ids},type:"training"}});
    await prisma.user.deleteMany({where:{id:{in:ids}}});
  });
  afterAll(async()=>prisma.$disconnect());

  it("cookie create UUID idempotency, GET readback, PUT toggle, DELETE and owner isolation",async()=>{
    const key=randomUUID(),draft=payload();
    expect((await invoke("/","GET")).status).toBe(401);
    expect((await invoke("/","POST",token,draft,key,"https://evil.example")).status).toBe(403);
    const created=await invoke("/","POST",token,draft,key);
    expect(created.status).toBe(200);
    const body=await created.json() as {data:{id:string}};
    const id=body.data.id;
    expect(typeof id).toBe("string");
    const replay=await invoke("/","POST",token,draft,key);
    expect(replay.status).toBe(200);
    expect((await replay.json() as {data:{id:string}}).data.id).toBe(id);
    expect(await prisma.reminder.count({where:{userId:owner,type:"training"}})).toBe(1);
    const conflict=await invoke("/","POST",token,payload("changed name"),key);
    expect(conflict.status).toBe(409);
    const lookup=await invoke(`/operations/${key}`,"GET",token);
    expect(lookup.status).toBe(200);
    expect((await lookup.json() as {data:{status:string}}).data.status).toBe("COMMITTED");
    const listing=await invoke("/","GET",token);
    expect(listing.status).toBe(200);
    expect((await listing.json() as {data:{id:string}[]}).data.map(row=>row.id)).toEqual([id]);
    const outsider=await invoke("/","GET",foreignToken);
    expect(outsider.status).toBe(200);
    expect((await outsider.json() as {data:unknown[]}).data).toEqual([]);
    expect((await invoke(`/${id}`,"PUT",foreignToken,{enabled:false})).status).toBe(404);
    expect((await invoke(`/${id}`,"DELETE",foreignToken)).status).toBe(404);
    const toggled=await invoke(`/${id}`,"PUT",token,{enabled:false,reminderTime:"12:30",timezone:"Europe/Paris"});
    expect(toggled.status).toBe(200);
    const readBack=await invoke("/","GET",token);
    const returned=await readBack.json() as {
      data:{enabled:boolean;reminderTime:string;timezone:string}[]
    };
    expect(returned.data[0])
      .toMatchObject({enabled:false,reminderTime:"12:30",timezone:"Europe/Paris"});
    expect((await invoke(`/${id}`,"DELETE",token)).status).toBe(200);
    const finalList=await invoke("/","GET",token);
    expect((await finalList.json() as {data:unknown[]}).data).toEqual([]);
  });
  it("account push status is a private owner-only boolean from real PostgreSQL",async()=>{
    const route="http://127.0.0.1:3001/api/v1/user/push-subscription-status";
    const request=(jwt?:string)=>app.request(route,{
      method:"GET",headers:jwt?{Cookie:`gafus_access=${jwt}`}:{},
    });
    const anonymous=await request();
    expect(anonymous.status).toBe(401);
    const initially=await request(token);
    expect(initially.status).toBe(200);
    expect(initially.headers.get("cache-control")).toBe("private, no-store");
    expect(await initially.json()).toEqual({success:true,data:{active:false}});
    const endpoint=`https://example.invalid/web1-sql-${owner}`;
    await prisma.pushSubscription.create({data:{
      userId:owner,endpoint,keys:{auth:"WEB1_ONLY",p256dh:"WEB1_ONLY"},
    }});
    const owned=await request(token);
    expect(owned.status).toBe(200);
    const response=await owned.text();
    expect(JSON.parse(response)).toEqual({success:true,data:{active:true}});
    expect(response).not.toContain(endpoint);
    expect(response).not.toContain("WEB1_ONLY");
    expect(owned.headers.get("cache-control")).toBe("private, no-store");
    expect(owned.headers.get("referrer-policy")).toBe("no-referrer");
    const other=await request(foreignToken);
    expect(other.status).toBe(200);
    expect(await other.json()).toEqual({success:true,data:{active:false}});
    expect(await prisma.pushSubscription.count({where:{userId:foreign}})).toBe(0);
  });
  it("owner-only Hono push control: device register/status/delete and conflict via WORK PG",async()=>{
    const prefix="http://127.0.0.1:3001/api/v1/subscriptions/push";
    const endpoint=`https://push.example.test/web1-${owner}`;
    const keys={p256dh:"WEB1_NONPROD_P256DH",auth:"WEB1_NONPROD_AUTH"};
    const send=(jwt:string,method:string,url:string,body?:unknown,writeOrigin=origin)=>
      app.request(url,{method,headers:{
        Cookie:`gafus_access=${jwt}`,
        ...(method!=="GET"?{Origin:writeOrigin,"Content-Type":"application/json"}:{}),
      },...(body===undefined?{}:{body:JSON.stringify(body)})});
    expect((await app.request(prefix,{method:"GET"})).status).toBe(401);
    expect((await send(token,"POST",prefix,{endpoint,keys},"https://evil.example")).status)
      .toBe(403);
    const saved=await send(token,"POST",prefix,{endpoint,keys});
    expect(saved.status).toBe(200);
    expect(await prisma.pushSubscription.count({where:{userId:owner,endpoint}})).toBe(1);
    const bAttempt=await send(foreignToken,"POST",prefix,{endpoint,keys});
    expect(bAttempt.status).toBe(409);
    expect(await bAttempt.json()).toEqual({success:false,code:"PUSH_ENDPOINT_OWNER_CONFLICT"});
    const device=(jwt:string)=>send(jwt,"POST",prefix+"/device-status",{endpoints:[endpoint]});
    const aState=await device(token);
    expect(aState.status).toBe(200);
    expect(await aState.json()).toEqual({success:true,data:{
      hasThisDeviceSubscription:true,determined:true,
    }});
    const bState=await device(foreignToken);
    expect(await bState.json()).toEqual({success:true,data:{
      hasThisDeviceSubscription:false,determined:true,
    }});
    expect((await send(foreignToken,"DELETE",prefix,{endpoint})).status).toBe(200);
    expect(await prisma.pushSubscription.count({where:{userId:owner,endpoint}})).toBe(1);
    expect((await send(token,"DELETE",prefix,{endpoint})).status).toBe(200);
    expect(await prisma.pushSubscription.count({where:{userId:owner,endpoint}})).toBe(0);
    const after=await device(token);
    expect(await after.json()).toEqual({success:true,data:{
      hasThisDeviceSubscription:false,determined:true,
    }});
  });
  it("five active reminders limit and validation 400: no sixth SQL row",async()=>{
    expect((await invoke("/","POST",token,{...payload(),reminderTime:"32:99"},randomUUID())).status).toBe(400);
    for(let i=1;i<=5;i++){
      const response=await invoke("/","POST",token,payload(`WEB1-${i}`),randomUUID());
      expect(response.status).toBe(200);
    }
    expect((await invoke("/","POST",token,payload("WEB1-6"),randomUUID())).status).toBe(400);
    expect(await prisma.reminder.count({where:{userId:owner,type:"training"}})).toBe(5);
  });
});
