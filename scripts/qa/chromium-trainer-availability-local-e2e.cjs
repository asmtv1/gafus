"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const account=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(a=>a.role==="TRAINER");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const env=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"}),raw=env.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1];
const url=new URL(raw);
if(!account?.id||url.hostname!=="127.0.0.1"||url.port!=="55921"||url.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_PROTECTED_DATABASE");
const proof=[],requests=[];let ownId=null,created=false;
async function db(fn){const c=new Client({connectionString:raw});await c.connect();try{return await fn(c)}finally{await c.end()}}
async function snapshot(){return db(async c=>{const sql=[
'SELECT cc.id,cc."userId",cc."isListed",',
'(SELECT count(*)::int FROM "ConsultationAvailabilityRule" x WHERE x."cynologistId"=cc.id) rules,',
'(SELECT count(*)::int FROM "ConsultationSlot" x WHERE x."cynologistId"=cc.id) slots,',
'(SELECT count(*)::int FROM "ConsultationBooking" x WHERE x."cynologistId"=cc.id) bookings',
'FROM "ConsultationCynologist" cc WHERE cc."userId"=$1'
].join(" ");const r=await c.query(sql,[account.id]);return r.rows[0]||null})}
async function cleanup(){const pre=await snapshot();
 if(!pre){console.log("QA_CONSULT_CLEANUP_ALREADY_ABSENT");return}
 if(!created||!ownId||pre.id!==ownId||pre.userId!==account.id||pre.isListed||pre.bookings!==0)throw Error("REFUSE_NONEXCLUSIVE_QA_CLEANUP");
 await db(async c=>{await c.query("BEGIN");try{
 const r=await c.query('DELETE FROM "ConsultationCynologist" WHERE id=$1 AND "userId"=$2 AND "isListed"=false',[ownId,account.id]);
 if(r.rowCount!==1)throw Error("QA_CLEANUP_DELETE_MISMATCH");
 await c.query("COMMIT");
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}});
 const after=await snapshot();if(after)throw Error("QA_CONSULT_CLEANUP_READBACK_NOT_EMPTY");
 console.log("QA_CONSULT_OWN_ONLY_CLEANUP_CONFIRMED",{preRules:pre.rules,preSlots:pre.slots,preBookings:pre.bookings,finalAbsent:true});
}
(async()=>{
 const before=await snapshot();
 if(before){
   // The one synthetic TRAINER row was created by our previous local-only
   // authenticated diagnostic immediately after an explicit zero-row preflight.
   // Refuse any existing schedule, booking, listing or foreign owner.
   if(before.userId!==account.id||before.isListed||before.bookings!==0||before.rules!==0||before.slots!==0)
     throw Error("REFUSE_UNRELATED_TRAINER_CONSULTATION_CONFIG");
   ownId=before.id;created=true;
   console.log("REUSING_ONLY_QA_DIAGNOSTIC_OWN_EMPTY_ROW");
 }
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 for(const [vp,w,h,action] of [["desktop",1280,800,"save"],["mobile",390,844,"readback"]]){
 const ctx=await b.newContext({viewport:{width:w,height:h}});
 await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["localhost","127.0.0.1"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const page=await ctx.newPage();
 page.on("response",r=>{const p=new URL(r.url()).pathname;if(p.startsWith("/api/v1/consultations"))requests.push({vp,method:r.request().method(),status:r.status(),path:p})});
 try{
 await page.goto("http://127.0.0.1:5173/main-panel/consultations/availability",{waitUntil:"domcontentloaded"});
 // Await the standalone shell's first /auth/me 401 + refresh 401.
 // DOMContentLoaded alone is too early: the guest form is not yet mounted.
 await page.getByRole("heading",{name:"Вход в панель тренера"}).waitFor({timeout:12000});
 await page.locator('input[autocomplete="username"]').fill(account.username);
 await page.locator('input[type="password"]').fill(account.password);
 await page.getByRole("button",{name:"Войти",exact:true}).click();
 await page.getByRole("heading",{name:"Моё расписание"}).waitFor({timeout:14000});
 if(action==="save"){
  await page.getByRole("button",{name:"Добавить интервал"}).waitFor({timeout:12000});
  const current=await snapshot();if(!current||current.userId!==account.id||current.isListed||current.bookings!==0)throw Error("WRONG_NEW_QA_CYNO");
  ownId=current.id;created=true;
  await page.getByRole("button",{name:"Добавить интервал"}).click();
  await page.getByRole("button",{name:"Сохранить расписание"}).click();
  await page.getByText("Расписание подтверждено сервером",{exact:true}).waitFor({timeout:60000});
  const p=await snapshot();if(p?.rules!==1||!requests.some(x=>x.method==="PUT"&&x.status===200))throw Error("QA_SCHEDULE_WRITE_READBACK_FAILURE");
  proof.push({vp,action,put200:true,ruleSQL:p.rules,slotsSQL:p.slots,pass:true});
 }else{
  await page.getByLabel("Начало 1").waitFor({timeout:14000});
  const rule={start:await page.getByLabel("Начало 1").inputValue(),end:await page.getByLabel("Окончание 1").inputValue()};
  const p=await snapshot();if(p?.rules!==1||rule.start!=="09:00"||rule.end!=="10:00")throw Error("QA_MOBILE_SCHEDULE_READBACK_FAILURE");
  proof.push({vp,action,rule,ruleSQL:p.rules,pass:true});
 }
 console.log("QA_TRAINER_CONSULT_AVAILABILITY_PASS",JSON.stringify(proof.at(-1)));
 }catch(e){console.log("QA_TRAINER_CONSULT_UI_FAIL_DIAG",JSON.stringify({vp,alerts:(await page.locator('[role="alert"]').allTextContents().catch(()=>[])).slice(0,4).map(x=>x.slice(0,110)),requests:requests.slice(-5),headings:(await page.locator("h1,h2").allTextContents().catch(()=>[])).slice(0,6)}));throw e;}
 finally{await ctx.close()}
 }
 }finally{await b.close()}
})().catch(e=>{console.log("QA_TRAINER_CONSULT_AVAILABILITY_ERROR",String(e.message).slice(0,220));process.exitCode=1}).finally(async()=>{
 try{await cleanup()}catch(e){console.log("QA_CONSULT_CLEANUP_ERROR",String(e.message).slice(0,210));process.exitCode=1}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/trainer-consultation-availability-e2e.json",JSON.stringify({proof,requests,qaOwnCleanupDone:!!created},null,2));
});
