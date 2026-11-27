/** Two original mounted Hono instances with independently captured real SQL ports.
 * Only the synthetic DNS answer is injected; mail is deliberately disabled. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { Resolver } from "node:dns/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { serve } from "@hono/node-server";
import { prisma } from "@gafus/prisma";
import { isMailerConfigured } from "@gafus/mailer";

const db = new URL(process.env.DATABASE_URL ?? "");
const redis = new URL(process.env.REDIS_URL ?? "");
const dir = process.env.DI12_DIR ?? "";
assert.equal(process.env.GAFUS_DI12_QA,"1");
assert.equal(db.hostname,"127.0.0.1");
assert.match(db.pathname,/^\/di12_[0-9a-f]{12}$/);
assert.equal(db.username,"di12");
assert.equal(redis.hostname,"127.0.0.1");
assert.equal(db.port,process.env.DI12_PG_PORT);
assert.equal(redis.port,process.env.DI12_REDIS_PORT);
assert.match(dir,/^\/tmp\/gafus-di12-http\.[A-Za-z0-9]+$/);
assert.equal(isMailerConfigured(),false);
const database = await prisma.$queryRaw<{db:string}[]>`SELECT current_database() AS db`;
assert.equal(database[0]?.db,db.pathname.slice(1));
const dns = Resolver.prototype.resolveMx;
Resolver.prototype.resolveMx = async (domain) => {
  assert.equal(domain,"di12.test","non-synthetic DNS denied");
  return [{priority:10,exchange:"mx.di12.test"}];
};
const { connection } = await import("@gafus/queues");
console.log("DI12_REDIS_START",connection.status);
const ping=await Promise.race([connection.ping(),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("DI12 Redis ping timeout: "+connection.status)),12000))]);
assert.equal(ping,"PONG");
console.log("DI12_REDIS_READY");
const { createApp } = await import("../app.js");
const { registrationContextPort } = await import("../modules/auth/composition/registration-context-instance.js");
const { credentialRegistrationPort } = await import("../modules/auth/composition/credential-registration-instance.js");
const { registrationContractRows } = await import("../modules/auth/composition/registration-contract-rows-instance.js");
const { reminderRows } = await import("../modules/reminders/composition/reminder-rows.js");
const { gafusWallet } = await import("../modules/gafus/composition/wallet-instance.js");
const { gafusStatusReadPorts } = await import("../modules/gafus/composition/status-ports.js");
const { transactionalContentPolicy } = await import("../modules/content-access/composition/transactional-policy-instance.js");
const { unlockRows } = await import("../modules/gafus/composition/unlock-rows-instance.js");

type Counts = Record<string,number>;
function instrument<T extends object>(target:T, counts:Counts, group:string):T {
  return new Proxy(target,{get(obj,key,receiver){
    const value=Reflect.get(obj,key,receiver);
    if(typeof value!=="function")return value;
    return (...args:unknown[])=>{
      const name=group+"."+String(key);
      counts[name]=(counts[name]??0)+1;
      if(group==="registration" || group==="registrationRows") console.log("DI12_PORT_CALL",name);
      return Reflect.apply(value,obj,args);
    };
  }});
}
function instance(){
  const counts:Counts={};
  const app=createApp({
    auth:{
      registrationContextPort:instrument(registrationContextPort,counts,"context"),
      credentialRegistrationPort:instrument(credentialRegistrationPort,counts,"registration"),
      registrationContractRows:instrument(registrationContractRows,counts,"registrationRows"),
    },
    reminders:instrument(reminderRows,counts,"reminder"),
    gafus:{gafusWallet:instrument(gafusWallet,counts,"wallet"),
      gafusStatusReadPorts,transactionalContentPolicy,unlockRows},
  });
  return {app,counts};
}
const a=instance(), b=instance();
assert.notEqual(a.app,b.app);
const servers:ReturnType<typeof serve>[]=[];
const prefix="di12_"+randomBytes(5).toString("hex");
let http=0, failed=false;
function ok(name:string, details:Record<string,unknown>={}){
  console.log("DI12_PASS",name,JSON.stringify(details));
}
async function listen(app:typeof a.app) {
  const server=serve({fetch:app.fetch,hostname:"127.0.0.1",port:0});
  servers.push(server);
  if(!server.listening)await once(server,"listening");
  const addr=server.address();assert.ok(addr&&typeof addr!=="string");
  return "http://127.0.0.1:"+addr.port;
}
async function closeServer(server: ReturnType<typeof serve>): Promise<void> {
  if ("closeAllConnections" in server && typeof server.closeAllConnections === "function") {
    server.closeAllConnections();
  }
  await new Promise<void>(resolve=>server.close(()=>resolve()));
}
type Req={token?:string;body?:unknown;key?:string;ip?:string};
async function req(base:string,path:string,method="GET",o:Req={}){
  const response=await fetch(base+"/api/v1"+path,{method,headers:{
    Accept:"application/json","X-Real-IP":o.ip??"127.0.0.1",
    ...(o.token?{Authorization:"Bearer "+o.token}:{}),
    ...(o.key?{"Idempotency-Key":o.key}:{}),
    ...(o.body===undefined?{}:{"Content-Type":"application/json"}),
  },body:o.body===undefined?undefined:JSON.stringify(o.body),signal:AbortSignal.timeout(45000)});
  http++;
  const json=response.status===429&&!response.headers.get("content-type")?.includes("application/json")
    ? {error:await response.text()} : await response.json() as any;
  return {status:response.status,json,headers:response.headers};
}
function status(r:Awaited<ReturnType<typeof req>>, expected:number){
  assert.equal(r.status,expected,JSON.stringify({status:r.status,success:r.json?.success,code:r.json?.code,error:r.json?.error}).slice(0,200));
}
function privateHeader(r:Awaited<ReturnType<typeof req>>){
  assert.match(r.headers.get("cache-control")??"",/no-store/);
}
function registration(n:string){
  return {name:prefix+"_"+n,email:prefix+"_"+n+"@di12.test",password:"Password1x",registrationChannel:"IOS",
    tempSessionId:randomUUID(),consentPayload:{acceptPersonalData:true,acceptPrivacyPolicy:true,acceptDataDistribution:true}};
}
try{
  const A=await listen(a.app),B=await listen(b.app);assert.notEqual(A,B);
  const reg=registration("owner");
  const first=await req(A,"/auth/register","POST",{body:reg});status(first,200);
  const id=first.json.data.user.id,token=first.json.data.accessToken as string;
  assert.equal(typeof token,"string");
  assert.equal(a.counts["registration.withRegistrationTransaction"],1);
  assert.equal(b.counts["registration.withRegistrationTransaction"]??0,0);
  const repeat=await req(B,"/auth/register","POST",{body:reg});status(repeat,200);
  assert.equal(repeat.json.data.user.id,id);
  assert.equal(b.counts["registration.withRegistrationTransaction"],1);
  assert.equal(a.counts["registration.withRegistrationTransaction"],1);
  assert.equal(await prisma.user.count({where:{username:reg.name}}),1);
  const receipt=await prisma.registrationEmailAttempt.findUnique({where:{tempSessionId:reg.tempSessionId}});
  assert.equal(receipt?.userId,id);
  const consents=await prisma.consentLog.count({where:{tempSessionId:reg.tempSessionId,userId:id}});
  assert.ok(consents>=3);
  const mismatch=await req(B,"/auth/register","POST",{body:{...reg,password:"Password2x"}});status(mismatch,400);
  ok("registration replay across independently bound app ports",{users:1,consents,receipt:true});
  const stranger=registration("other");
  const other=await req(B,"/auth/register","POST",{body:stranger});status(other,200);
  const otherId=other.json.data.user.id,otherToken=other.json.data.accessToken as string;
  const anonymous=await req(A,"/reminders");status(anonymous,401);privateHeader(anonymous);
  const key=randomUUID();
  const body={name:"synthetic reminder",reminderTime:"12:30",reminderDays:"1,3",timezone:"Europe/Moscow"};
  const reminder=await req(A,"/reminders","POST",{token,body,key});status(reminder,200);privateHeader(reminder);
  const reminderId=reminder.json.data.id;
  assert.equal(a.counts["reminder.withAG4ReminderCreateTx"],1);
  assert.equal(b.counts["reminder.withAG4ReminderCreateTx"]??0,0);
  const retry=await req(B,"/reminders","POST",{token,body,key});status(retry,200);
  assert.equal(retry.json.data.id,reminderId);
  assert.equal(b.counts["reminder.withAG4ReminderCreateTx"],1);
  const conflict=await req(B,"/reminders","POST",{token,body:{...body,name:"changed"},key});status(conflict,409);
  const lookup=await req(B,"/reminders/operations/"+key,"GET",{token});status(lookup,200);
  privateHeader(lookup);
  const foreign=await req(B,"/reminders/operations/"+key,"GET",{token:otherToken});status(foreign,404);privateHeader(foreign);
  const forbidden=await req(B,"/reminders/"+reminderId,"PUT",{token:otherToken,body:{enabled:false}});status(forbidden,404);
  assert.equal(await prisma.reminder.count({where:{userId:id}}),1);
  assert.equal(await prisma.reminderMutationReceipt.count({where:{ownerUserId:id,operationKey:key}}),1);
  const old=await req(B,"/reminders","POST",{token,body:{...body,name:"legacy keyless"}});
  status(old,200);assert.notEqual(old.json.data.id,reminderId);
  assert.equal(typeof old.json.data.reminderTime,"string");
  assert.equal(old.json.data.timezone,"Europe/Moscow");
  const listed=await req(A,"/reminders","GET",{token});status(listed,200);
  assert.equal(listed.json.data.length,2);
  const outsiderList=await req(A,"/reminders","GET",{token:otherToken});status(outsiderList,200);assert.deepEqual(outsiderList.json.data,[]);
  ok("reminders mounted keyed replay, legacy DTO, foreign ACL",{reminders:2,receipts:1});
  const author=await prisma.user.create({data:{username:prefix+"_trainer",password:"!synthetic!",role:"TRAINER"}});
  const article=await prisma.article.create({data:{title:"QA paid article",slug:prefix+"_article",content:"synthetic",authorId:author.id,visibility:"PAID"}});
  await prisma.gafusWallet.create({data:{userId:id,balance:2}});
  const wbody={clientRequestId:"di12_"+randomUUID(),target:{type:"ARTICLE",articleId:article.id}};
  const spend=await req(A,"/gafus/unlock","POST",{token,body:wbody});status(spend,200);privateHeader(spend);
  assert.equal(spend.json.data.spent,1);
  const spendRetry=await req(B,"/gafus/unlock","POST",{token,body:wbody});status(spendRetry,200);
  assert.equal(spendRetry.json.data.replay,true);
  const forged=await req(B,"/gafus/unlock","POST",{token:otherToken,body:{...wbody,userId:id}});status(forged,400);
  const h1=await req(A,"/gafus/history","GET",{token});status(h1,200);
  assert.equal(h1.json.data.items.length,1);
  const h2=await req(B,"/gafus/history","GET",{token:otherToken});status(h2,200);
  assert.equal(h2.json.data.items.length,0);
  assert.equal(a.counts["wallet.listGafusTransactions"],1);
  assert.equal(b.counts["wallet.listGafusTransactions"],1);
  assert.equal((await prisma.gafusWallet.findUnique({where:{userId:id}}))?.balance,1);
  assert.equal(await prisma.gafusTransaction.count({where:{userId:id,kind:"SPEND"}}),1);
  assert.equal(await prisma.gafusTargetAccess.count({where:{userId:id,targetType:"ARTICLE"}}),1);
  assert.equal(await prisma.gafusTransaction.count({where:{userId:otherId}}),0);
  ok("wallet mounted replay and owner-scoped history",{balance:1,spends:1,grants:1});
  const unauthWallet=await req(A,"/gafus/history");status(unauthWallet,401);privateHeader(unauthWallet);
  const notFound=await req(A,"/di12-does-not-exist","GET",{token});status(notFound,404);
  const pgArgs=["-D",dir+"/pg"];
  execFileSync("pg_ctl",[...pgArgs,"-m","fast","-w","stop"],{stdio:"ignore"});
  try{
    const stopped=await req(B,"/gafus/history","GET",{token});
    status(stopped,503);assert.equal(stopped.json.code,"AUTH_UNAVAILABLE");
    privateHeader(stopped);
    assert.ok(!JSON.stringify(stopped.json).includes("postgresql://"));
    ok("PG stopped: private route fails closed",{status:stopped.status});
  }finally{
    execFileSync("pg_ctl",[...pgArgs,"-l",dir+"/pg.log","-o","-h 127.0.0.1 -p "+db.port+" -k "+dir+" -c max_connections=30 -c shared_buffers=32MB","-w","start"],{stdio:"ignore"});
  }
  let recovered=await req(A,"/reminders","POST",{token,body,key});
  for(let i=0;recovered.status===503&&i<15;i++){
    await delay(1000);
    recovered=await req(A,"/reminders","POST",{token,body,key});
  }
  status(recovered,200);assert.equal(recovered.json.data.id,reminderId);
  assert.equal(await prisma.reminderMutationReceipt.count({where:{ownerUserId:id,operationKey:key}}),1);
  const recoveredWallet=await req(B,"/gafus/unlock","POST",{token,body:wbody});status(recoveredWallet,200);
  assert.equal(await prisma.gafusTransaction.count({where:{userId:id,kind:"SPEND"}}),1);
  ok("PG restart and replay without duplicate writes",{receipts:1,spends:1});
  // Exercise the release-tagged client modules themselves, replacing only their
  // shared HTTP transport with an adapter to the real, isolated Hono listener.
  const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");
  function clientModule(sha:string,file:string,base:string){
    const source=execFileSync("git",["show",sha+":apps/mobile/src/shared/lib/api/"+file+".ts"],{encoding:"utf8"});
    const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const exports:Record<string,any>={};
    const apiClient=async(path:string,options:any={})=>{
      assert.ok(path.startsWith("/api/v1/"));
      const response=await req(base,path.slice("/api/v1".length),options.method??"GET",{token,body:options.body});
      return response.json;
    };
    new Function("require","exports",js)((name:string)=>{
      assert.equal(name,"./client");return {apiClient};
    },exports);
    return exports;
  }
  const versions=[
    ["iOS 1.7.5 build 101","f6e6994e1167e9dbdf4c9ab13bbfbcaa7168c9d2"],
    ["RuStore 1.7.5 build 17507","3d57cf0963b9351dd241dd28eed5d0c92c0e7369"],
    ["Google Play 1.7.6 build 17603","db6a46fc4878278a7a339c039559ee92d5482507"],
    ["QA current 1.7.6","850874bf306d6aa96629e704ca256033ef1d99f2"],
  ];
  for(const [version,sha] of versions){
    const r=clientModule(sha,"reminders",A).remindersApi;
    const result=await r.getAll();
    assert.equal(result.success,true);
    assert.ok(result.data.some((x:any)=>x.id===reminderId&&x.reminderTime==="12:30"&&x.timezone==="Europe/Moscow"));
    const g=clientModule(sha,"gafus",B).gafusApi;
    const history=await g.history();
    assert.equal(history.items.length,1);
    ok("release client DTO on mounted candidate",{version,sha,reminders:result.data.length,history:history.items.length});
  }
  const redisPid=Number(process.env.DI12_REDIS_PID);
  assert.ok(Number.isInteger(redisPid)&&redisPid>1);
  // Pause only the Redis process created by the wrapper. Resume before checking
  // eventual response; this proves transient unavailability, not a cold restart.
  process.kill(redisPid,"SIGSTOP");
  let pending:Promise<Awaited<ReturnType<typeof req>>>;
  try{
    pending=req(B,"/reminders/operations/"+key,"GET",{token});
    await delay(1200);
  }finally{process.kill(redisPid,"SIGCONT");}
  const redisRecovered=await pending!;
  assert.ok([200,503].includes(redisRecovered.status));
  const redisRetry=await req(A,"/reminders/operations/"+key,"GET",{token});status(redisRetry,200);
  assert.equal(await prisma.reminderMutationReceipt.count({where:{ownerUserId:id,operationKey:key}}),1);
  ok("Redis paused/resumed, read retry",{firstStatus:redisRecovered.status});
  // Isolated Redis limiter: a separate synthetic proxy IP cannot affect other actors.
  let limited=false;
  for(let i=0;i<110;i++){
    const limitedRequest=await req(i%2?A:B,"/reminders/operations/"+key,"GET",{ip:"127.0.0.9"});
    if(limitedRequest.status===429){privateHeader(limitedRequest);limited=true;break;}
    status(limitedRequest,401);
  }
  assert.equal(limited,true);
  ok("429 from shared isolated Redis with private no-store",{http});
  const rollbackRoot=process.env.DI12_ROLLBACK_ROOT;
  if(rollbackRoot){
    const sha=execFileSync("git",["-C",rollbackRoot,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
    assert.ok(sha.startsWith("2f485a394"));
    assert.equal(execFileSync("git",["-C",rollbackRoot,"status","--porcelain","--untracked-files=no"],{encoding:"utf8"}).trim(),"");
    // Close both candidate listeners. Mount the actual previous QA app from its
    // own worktree, then switch the current client transport to that listener.
    for(const server of servers.splice(0)){await closeServer(server);}
    const rollbackModule=await import(pathToFileURL(rollbackRoot+"/apps/api/src/app.ts").href);
    const rollbackBase=await listen(rollbackModule.app);
    const currentSha=versions[3]![1]!;
    const r=clientModule(currentSha,"reminders",rollbackBase).remindersApi;
    const result=await r.getAll();
    assert.equal(result.success,true);
    assert.ok(result.data.some((x:any)=>x.id===reminderId&&x.reminderTime==="12:30"));
    const g=clientModule(currentSha,"gafus",rollbackBase).gafusApi;
    assert.equal((await g.history()).items.length,1);
    const replayed=await g.unlock(wbody);
    assert.equal(replayed.replay,true);
    assert.equal(await prisma.gafusTransaction.count({where:{userId:id,kind:"SPEND"}}),1);
    ok("current client against previous QA API after listener switch",{clientSha:currentSha,apiSha:sha,spends:1});
  }
  console.log("DI12_HTTP_ALL_PASS",JSON.stringify({http,instances:2,realPg:true,realRedis:true}));
}catch(e){failed=true;console.error("DI12_HTTP_FAIL",e instanceof Error?e.stack:e);}
finally{
  Resolver.prototype.resolveMx=dns;
  for(const server of servers){await closeServer(server);}
  await prisma.$disconnect();
}
process.exit(failed?1:0);
