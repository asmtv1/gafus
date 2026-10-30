/** Integration acceptance: actual Hono HTTP -> Core -> isolated PG -> Prisma readback. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { prisma } from "@gafus/prisma";
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../middleware/auth";
import { adminSubscriptionRoutes } from "../routes/v1/admin-subscriptions";
import { adminAnalyticsRoutes } from "../routes/v1/admin-analytics";
import { mobileIntroRoutes } from "../routes/v1/mobile-intro";

const target = new URL(process.env.DATABASE_URL ?? "");
assert.equal(target.hostname,"127.0.0.1");
assert.equal(target.port,"55459");
assert.equal(target.pathname,"/admin4_scratch_only");
assert.equal(target.username,"admin4_scratch");
assert.equal(process.env.API_PORT,"55460");
const db = await prisma.$queryRawUnsafe<{db:string; dbport:number; actor:string}[]>(
  "select current_database() db, inet_server_port()::int dbport, current_user actor"
);
assert.equal(db[0]?.db, "admin4_scratch_only");
assert.equal(db[0]?.dbport, 55459);
assert.equal(db[0]?.actor,"admin4_scratch");

const admin = await prisma.user.create({ data: {
  username:"admin4_scratch_admin", email:"admin4@example.invalid", password:"not-used-for-test",
  passwordSetAt:new Date(), role:"ADMIN", registrationPending:false,
}});
const moderator = await prisma.user.create({ data: {
  username:"admin4_scratch_moderator", password:"not-used-for-test",
  passwordSetAt:new Date(), role:"MODERATOR", registrationPending:false,
}});
const adminToken = await generateAccessToken({id:admin.id,username:admin.username,role:"ADMIN"});
const moderatorToken = await generateAccessToken({id:moderator.id,username:moderator.username,role:"MODERATOR"});
const app = new Hono();
for (const path of ["/api/v1/admin/app-subscriptions","/api/v1/admin/app-subscriptions/*",
 "/api/v1/admin/analytics/*","/api/v1/mobile-intro/admin/*", "/api/v1/mobile-intro/auth-outcome"]) {
  app.use(path, authMiddleware);
}
app.route("/api/v1/admin/app-subscriptions",adminSubscriptionRoutes);
app.route("/api/v1/admin/analytics",adminAnalyticsRoutes);
app.route("/api/v1/mobile-intro",mobileIntroRoutes);
app.onError((err,c)=>{
  console.error("ADMIN4_HONO_TEST_ERROR",err instanceof Error ? err.message : String(err));
  return c.json({success:false,code:"TEST_INTERNAL_ERROR"},500);
});
const host = "http://127.0.0.1:55460";
const listener=serve({fetch:app.fetch,hostname:"127.0.0.1",port:55460});
let pass=0;
async function invoke(path:string,options:{method?:string;token?:string;json?:unknown}={}){
  const response=await fetch(host+path,{
    method:options.method??"GET",
    headers:{ ...(options.token?{Authorization:`Bearer ${options.token}`}:{}),
      ...(options.json!==undefined?{"Content-Type":"application/json"}:{}) },
    ...(options.json!==undefined?{body:JSON.stringify(options.json)}:{}),
    signal:AbortSignal.timeout(12000),
  });
  const payload=await response.json() as {success?:boolean;data?:Record<string,unknown>;code?:string};
  return {status:response.status,headers:response.headers,payload};
}
function check(cond:boolean,name:string){assert.equal(cond,true,name);pass++;console.log("PASS",name);}
try{
  const guest=await invoke("/api/v1/admin/app-subscriptions?tab=promo-codes");
  check(guest.status===401,"guest forbidden by real JWT middleware");
  const hidden=await invoke("/api/v1/admin/analytics/rewarded-ads?days=30",{token:moderatorToken});
  check(hidden.status===403,"moderator forbidden from archival reward analytics");
  const empty=await invoke("/api/v1/admin/analytics/rewarded-ads?days=30",{token:adminToken});
  check(empty.status===200&&typeof empty.payload.data?.today==="object"&&
    empty.headers.get("cache-control")?.includes("no-store")===true,"reward summary real SQL empty snapshot");
  const badPeriod=await invoke("/api/v1/admin/analytics/rewarded-ads?days=1000",{token:adminToken});
  check(badPeriod.status===400,"invalid reward analytics range rejected");

  const code="ADM4_ONLY_"+randomUUID().slice(0,8).replaceAll("-","").toUpperCase();
  const created=await invoke("/api/v1/admin/app-subscriptions/promo-codes",{
    method:"POST",token:adminToken,json:{code,discountPercent:15,isActive:true},
  });
  const promoId=created.payload.data?.id;
  check(created.status===200&&typeof promoId==="string","admin promo POST into real isolated PG");
  const persisted=await prisma.appSubscriptionPromoCode.findUnique({
    where:{id:promoId as string},include:{events:true},
  });
  check(persisted?.discountPercent===15&&persisted?.events.length===1,"fresh SQL promo and audit readback");
  const duplicate=await invoke("/api/v1/admin/app-subscriptions/promo-codes",{
    method:"POST",token:adminToken,json:{code,discountPercent:25,isActive:true},
  });
  check(duplicate.status===409&&duplicate.payload.code==="PROMO_CODE_DUPLICATE","duplicate POST idempotent/conflict");
  const moderatorWrite=await invoke("/api/v1/admin/app-subscriptions/promo-codes",{
    method:"POST",token:moderatorToken,json:{code:"ADM4_DENIED",discountPercent:10,isActive:true},
  });
  check(moderatorWrite.status===403,"moderator promo mutation rejected");
  check(await prisma.appSubscriptionPromoCode.count({where:{normalizedCode:"ADM4_DENIED"}})===0,"moderator rejection no SQL write");
  const adminRead=await invoke("/api/v1/admin/app-subscriptions?tab=promo-codes",{token:adminToken});
  check(adminRead.status===200&&Array.isArray(adminRead.payload.data?.promoCodes)&&
    (adminRead.payload.data?.promoCodes as {id:string}[]).some(p=>p.id===promoId),"admin list GET reflects SQL write");
  const moderatorRead=await invoke("/api/v1/admin/app-subscriptions?tab=promo-codes",{token:moderatorToken});
  check(moderatorRead.status===200&&moderatorRead.payload.data?.role==="MODERATOR","moderator list GET read only");
  const invalid=await invoke("/api/v1/admin/app-subscriptions/promo-codes",{
    method:"POST",token:adminToken,json:{code:"NO",discountPercent:85,isActive:true},
  });
  check(invalid.status===400,"discount invalid rejected before SQL");
  const update=await invoke(`/api/v1/admin/app-subscriptions/promo-codes/${promoId}`,{
    method:"PATCH",token:adminToken,json:{discountPercent:23,isActive:false},
  });
  check(update.status===200,"admin PATCH promo completed");
  const revised=await prisma.appSubscriptionPromoCode.findUnique({
    where:{id:promoId as string},include:{events:true},
  });
  check(revised?.revision===2&&revised?.events.length===3&&revised.isActive===false,"revision and two events persisted atomically");
  const archived=await invoke(`/api/v1/admin/app-subscriptions/promo-codes/${promoId}`,{
    method:"DELETE",token:adminToken,
  });
  check(archived.status===200,"admin archives promo");
  const again=await invoke(`/api/v1/admin/app-subscriptions/promo-codes/${promoId}`,{
    method:"DELETE",token:adminToken,
  });
  check(again.status===409,"duplicate archive rejected");
  const finalPromo=await prisma.appSubscriptionPromoCode.findUnique({
    where:{id:promoId as string},include:{events:true},
  });
  check(Boolean(finalPromo?.archivedAt)&&finalPromo?.events.length===4,"archive readback without duplicate audit");
  const payments=await invoke("/api/v1/admin/app-subscriptions?tab=payments",{token:adminToken});
  check(payments.status===200&&Array.isArray(payments.payload.data?.dashboard &&
    (payments.payload.data.dashboard as {rows?:unknown[]}).rows),"empty subscription dashboard real SQL");
  const npd=await invoke("/api/v1/admin/app-subscriptions?tab=npd",{token:adminToken});
  check(npd.status===200&&Array.isArray((npd.payload.data?.npd as {items?:unknown[]})?.items),"NPD empty receipts real SQL");
  const invalidNpd=await invoke("/api/v1/admin/app-subscriptions/npd/doesnotexist/retry",{method:"POST",token:adminToken});
  check(invalidNpd.status===400&&invalidNpd.payload.code==="NOT_FOUND","missing receipt guarded no provider calls");

  const installationId="test-installation-"+randomUUID();
  const openedAt=new Date(Date.now()-35000).toISOString();
  const occurredAt=new Date(Date.now()-30000).toISOString();
  const event={installationId,introVersion:"admin4-v1",platform:"ANDROID",
    event:"OPENED",openedAt,occurredAt};
  const open1=await invoke("/api/v1/mobile-intro/events",{method:"POST",json:event});
  check(open1.status===200,"mobile Android opened POST written to PostgreSQL");
  const open2=await invoke("/api/v1/mobile-intro/events",{method:"POST",json:event});
  check(open2.status===200,"duplicate mobile opened POST accepted without new row");
  const finish=await invoke("/api/v1/mobile-intro/events",{
    method:"POST",json:{...event,event:"COMPLETED",occurredAt:new Date(Date.now()-20000).toISOString()},
  });
  check(finish.status===200,"completion POST persists");
  const lateSkip=await invoke("/api/v1/mobile-intro/events",{
    method:"POST",json:{...event,event:"SKIPPED",occurredAt:new Date(Date.now()-18000).toISOString()},
  });
  check(lateSkip.status===200,"late skip replay ignored without contradiction");
  const storedIntro=await prisma.mobileIntroInstallation.findUnique({
    where:{installationId_introVersion:{installationId,introVersion:"admin4-v1"}},
  });
  check(storedIntro?.completion==="COMPLETED"&&
    await prisma.mobileIntroInstallation.count({where:{installationId}})===1,"deduplicated mobile intro SQL row first terminal event wins");
  const mismatch=await invoke("/api/v1/mobile-intro/auth-outcome",{
    method:"POST",token:adminToken,json:{installationId,introVersion:"admin4-v1",
      platform:"ANDROID",openedAt,outcome:"REGISTERED",userId:moderator.id},
  });
  check(mismatch.status===409,"mobile outcome cannot forge different user");
  const conversion=await invoke("/api/v1/mobile-intro/auth-outcome",{
    method:"POST",token:adminToken,json:{installationId,introVersion:"admin4-v1",
      platform:"ANDROID",openedAt,outcome:"REGISTERED",userId:admin.id},
  });
  check(conversion.status===200,"mobile auth conversion POST");
  const conversionAgain=await invoke("/api/v1/mobile-intro/auth-outcome",{
    method:"POST",token:adminToken,json:{installationId,introVersion:"admin4-v1",
      platform:"ANDROID",openedAt,outcome:"LOGGED_IN",userId:admin.id},
  });
  check(conversionAgain.status===200,"late auth replay harmless");
  const storedAuth=await prisma.mobileIntroInstallation.findUnique({
    where:{installationId_introVersion:{installationId,introVersion:"admin4-v1"}},
  });
  check(storedAuth?.authOutcome==="REGISTERED"&&storedAuth.authOutcomeUserId===admin.id,"auth outcome SQL readback first result wins");
  const start=new Date(Date.now()-86400000).toISOString(), end=new Date(Date.now()+86400000).toISOString();
  const report=await invoke("/api/v1/mobile-intro/admin/report?"+new URLSearchParams({start,end}),{token:adminToken});
  check(report.status===200&&report.payload.data?.openings===1&&
    report.payload.data?.completed===1&&report.payload.data?.registered===1,
    "admin intro report includes persisted SQL install and conversion");
  const moderatorReport=await invoke("/api/v1/mobile-intro/admin/report?"+new URLSearchParams({start,end}),{token:moderatorToken});
  check(moderatorReport.status===403,"moderator cannot read admin intro report");
  await prisma.user.update({where:{id:admin.id},data:{role:"USER"}});
  const demoted=await invoke("/api/v1/admin/app-subscriptions?tab=promo-codes",{token:adminToken});
  check(demoted.status===401||demoted.status===403,"JWT admin demoted at DB immediately denied");
  await prisma.user.update({where:{id:admin.id},data:{role:"ADMIN"}});
  // All below are synthetic receipts with NO provider credentials or worker. The
  // purpose is to prove API -> Core -> PostgreSQL CAS / replay protection.
  await prisma.npdConnection.create({data:{
    id:"default",inn:"123456789012",deviceId:"admin4-synthetic-device",
    refreshTokenCipher:Uint8Array.from([1]),refreshTokenIv:Uint8Array.from([2]),
    refreshTokenTag:Uint8Array.from([3]),refreshTokenKeyVersion:1,
    status:"ACTIVE",fiscalizationStartedAt:new Date(),
  }});
  async function syntheticReceipt(status:"FAILED"|"RECONCILIATION_REQUIRED",
    operationStatus:"FAILED"|"RECONCILIATION_REQUIRED"){
    const payment=await prisma.appSubscriptionPayment.create({data:{
      userId:admin.id,provider:"YOOKASSA",kind:"INITIAL",status:"SUCCEEDED",
      planCode:"MONTHLY",idempotenceKey:randomUUID(),
      amount:2500,currency:"RUB",buyerEmail:"admin4@example.invalid",
    }});
    const receipt=await prisma.npdReceipt.create({data:{
      paymentId:payment.id,connectionId:"default",status,
      amountKopecks:250000,currency:"RUB",planCode:"MONTHLY",intervalDays:30,
      serviceName:"TEST ONLY NOT AN ACTUAL PURCHASE",operationAt:new Date(),
      buyerEmail:"admin4@example.invalid",printUrl:"https://example.invalid/admin4-only",
      jsonUrl:"https://example.invalid/admin4-only.json",
    }});
    const operation=await prisma.npdReceiptOperation.create({data:{
      receiptId:receipt.id,type:"CREATE",status:operationStatus,
      nextAttemptAt:new Date(Date.now()-60000),
    }});
    return {receipt,operation};
  }
  const failedReceipt=await syntheticReceipt("FAILED","FAILED");
  const adminNpd=await invoke("/api/v1/admin/app-subscriptions?tab=npd&npdStatus=FAILED",
    {token:adminToken});
  const npdRows=(adminNpd.payload.data?.npd as {items?:{id:string;user:{email:string|null};printUrl:string|null}[]})?.items??[];
  console.log("NPD_GET_DIAGNOSTIC",{status:adminNpd.status,code:adminNpd.payload.code,rows:npdRows.length,hasId:npdRows.some(row=>row.id===failedReceipt.receipt.id),emailIsSynthetic:npdRows[0]?.user.email==="admin4@example.invalid"});
  check(adminNpd.status===200&&npdRows.some(row=>row.id===failedReceipt.receipt.id)&&
    npdRows[0]?.user.email==="admin4@example.invalid","admin NPD real SQL receipt listing with details");
  const modNpd=await invoke("/api/v1/admin/app-subscriptions?tab=npd&npdStatus=FAILED",
    {token:moderatorToken});
  const modRows=(modNpd.payload.data?.npd as {items?:{user:{email:string|null};printUrl:string|null}[]})?.items??[];
  check(modNpd.status===200&&modRows.length===1&&modRows[0]?.user.email===null&&
    modRows[0]?.printUrl===null,"moderator receipt PII and print URL redacted in Core");
  const blockedRetry=await invoke(`/api/v1/admin/app-subscriptions/npd/${failedReceipt.receipt.id}/retry`,
    {method:"POST",token:moderatorToken});
  check(blockedRetry.status===403,"moderator NPD retry forbidden");
  const retryPath=`/api/v1/admin/app-subscriptions/npd/${failedReceipt.receipt.id}/retry`;
  const retry1=await invoke(retryPath,{method:"POST",token:adminToken});
  check(retry1.status===200,"first NPD retry Core CAS succeeds");
  const afterFirst=await prisma.npdReceiptOperation.findUniqueOrThrow({where:{id:failedReceipt.operation.id}});
  check(afterFirst.status==="RETRY"&&Boolean(afterFirst.nextAttemptAt),
    "NPD operation status and next attempt persisted");
  const retryQueuePage=await invoke("/api/v1/admin/app-subscriptions?tab=npd&npdStatus=FAILED",
    {token:adminToken});
  const retryQueueRows=(retryQueuePage.payload.data?.npd as {items?:{id:string;canRetry:boolean}[]})?.items??[];
  check(retryQueueRows.some(row=>row.id===failedReceipt.receipt.id&&row.canRetry===false),
    "NPD projection hides retry action after operation is already queued");
  const retryAgain=await invoke(retryPath,{method:"POST",token:adminToken});
  const afterAgain=await prisma.npdReceiptOperation.findUniqueOrThrow({where:{id:failedReceipt.operation.id}});
  check(retryAgain.status===400&&retryAgain.payload.code==="NOT_RETRYABLE"&&
    afterFirst.nextAttemptAt?.getTime()===afterAgain.nextAttemptAt?.getTime(),
    "duplicate retry rejected; existing scheduler timestamp unchanged");
  // Re-create a FAILED state to simulate a later provider processing failure.
  await prisma.npdReceiptOperation.update({where:{id:failedReceipt.operation.id},
    data:{status:"FAILED",nextAttemptAt:new Date(Date.now()-20000)}});
  const concurrent=await Promise.all([invoke(retryPath,{method:"POST",token:adminToken}),
    invoke(retryPath,{method:"POST",token:adminToken})]);
  check(concurrent.filter(r=>r.status===200).length===1&&
    concurrent.filter(r=>r.status===400).length===1,
    "simultaneous NPD retries only one CAS winner in real PostgreSQL");
  const ambiguous=await syntheticReceipt("RECONCILIATION_REQUIRED","RECONCILIATION_REQUIRED");
  const noBlindRetry=await invoke(`/api/v1/admin/app-subscriptions/npd/${ambiguous.receipt.id}/retry`,
    {method:"POST",token:adminToken});
  check(noBlindRetry.status===409,"ambiguous NPD not blindly retried");
  const reconcilePath=`/api/v1/admin/app-subscriptions/npd/${ambiguous.receipt.id}/reconcile`;
  const requested=await invoke(reconcilePath,{method:"POST",token:adminToken});
  check(requested.status===200,"NPD reconciliation single guarded request");
  const persistedReconcile=await prisma.npdReceiptOperation.findUniqueOrThrow({where:{id:ambiguous.operation.id}});
  check(persistedReconcile.lastErrorCode==="ADMIN_RECONCILIATION_REQUESTED",
    "NPD reconciliation request SQL readback");
  const reconcileQueuePage=await invoke(
    "/api/v1/admin/app-subscriptions?tab=npd&npdStatus=RECONCILIATION_REQUIRED",
    {token:adminToken});
  const reconcileQueueRows=(reconcileQueuePage.payload.data?.npd as
    {items?:{id:string;canReconcile:boolean}[]})?.items??[];
  check(reconcileQueueRows.some(row=>row.id===ambiguous.receipt.id&&row.canReconcile===false),
    "NPD projection hides reconciliation action once already requested");
  const repeatedReconcile=await invoke(reconcilePath,{method:"POST",token:adminToken});
  check(repeatedReconcile.status===400&&repeatedReconcile.payload.code==="NOT_AMBIGUOUS",
    "repeated NPD reconciliation rejected, no duplicate mutation");
  // Real Vite preview, Playwright; test-only auth bridge.
  // All other UI requests reach actual Hono and isolated SQL.
  const uiCode="ADM4_UI_"+randomUUID().slice(0,8).toUpperCase();
  const browserRoot="/Users/asmtv1/Desktop/gafus-refactor";
  const browserScript=browserRoot+"/apps/admin-panel/src/admin-live/admin4-live-db-browser.mjs";
  const screenshotProcess=spawn(process.execPath,[browserScript],{
    cwd:browserRoot,
    env:{...process.env,ADMIN4_TEST_BEARER:adminToken,ADMIN4_TEST_ADMIN_ID:admin.id,
      ADMIN4_TEST_ARCHIVED_PROMO:code,ADMIN4_TEST_UI_PROMO:uiCode},
    stdio:["ignore","pipe","pipe"],
  });
  let browserStdout="",browserStderr="";
  screenshotProcess.stdout.on("data",(chunk:Buffer)=>{browserStdout+=String(chunk);});
  screenshotProcess.stderr.on("data",(chunk:Buffer)=>{browserStderr+=String(chunk);});
  const browserExit=await new Promise<number|null>((resolve,reject)=>{
    screenshotProcess.once("error",reject);
    screenshotProcess.once("close",(code)=>resolve(code));
  });
  console.log(browserStdout.slice(-4500));
  if(browserExit!==0)throw Error("REAL_BROWSER_TEST_FAILED "+browserStderr.slice(-2500));
  const uiStored=await prisma.appSubscriptionPromoCode.findUnique({
    where:{normalizedCode:uiCode},include:{events:true},
  });
  check(Boolean(uiStored)&&uiStored?.events.length===1,
    "React browser form POST persisted exactly once in actual PostgreSQL");
  console.log("ADMIN4_REAL_HTTP_SQL_ALL_PASS",{assertions:pass,readonlyReward:true,realSqlPromo:true,realSqlIntro:true,realSqlNpd:true,realProviderCalls:0});
} finally {
  await new Promise<void>((resolve)=>listener.close(()=>resolve()));
  await prisma.$disconnect();
}
