"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const actor=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(x=>x.role==="TRAINER");
const apiPid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8",timeout:3000}).trim().split("\n")[0];
if(!/^\d+$/.test(apiPid))throw Error("NO_LOCAL_API_PID");
const ps=cp.execFileSync("ps",["eww","-p",apiPid,"-o","command="],{encoding:"utf8",timeout:3000});
const raw=ps.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1];if(!raw)throw Error("MISSING_QA_DB");
const u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_NONLOCAL_WORK_DB");
let createdId=null;
const results=[];
async function sqlRead(){
 if(!createdId)return {found:0};
 const db=new Client({connectionString:raw});await db.connect();
 try{const r=await db.query('SELECT id,"authorId",title FROM "Step" WHERE id=$1',[createdId]);return {found:r.rowCount,ownerOk:r.rows[0]?.authorId===actor.id,titleOk:r.rows[0]?.title?.startsWith("QA:")}}finally{await db.end()}
}
async function sqlRestore(){
 if(!createdId)return;
 const db=new Client({connectionString:raw});await db.connect();
 try{
  const x=await db.query('SELECT "authorId",title FROM "Step" WHERE id=$1',[createdId]);
  if(x.rowCount!==1)return;
  if(x.rows[0].authorId!==actor.id||!x.rows[0].title.startsWith("QA:"))throw Error("REFUSE_NONQA_STEP");
  const links=await db.query('SELECT count(*)::int cnt FROM "StepOnDay" WHERE "stepId"=$1',[createdId]);
  if(links.rows[0].cnt!==0)throw Error("REFUSE_LINKED_STEP");
  await db.query('DELETE FROM "Step" WHERE id=$1 AND "authorId"=$2 AND title LIKE $3',[createdId,actor.id,"QA:%"]);
  console.log("TRAINER_QA_STEP_LOCAL_SAFE_RECOVERY");
 }finally{await db.end()}
}
async function login(page,ctx){
 if(process.env.QA_TRAINER_SHARED_ORIGIN==="1"){
  const storage=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-trainer-temporary-cookie-20261029.json","utf8"));
  if(!Array.isArray(storage.cookies)||!storage.cookies.some(x=>x.name==="gafus_access"&&x.domain==="127.0.0.1"))throw Error("NO_EXACT_TRAINER_COOKIE");
  await ctx.addCookies(storage.cookies);
  return;
 }
 await page.goto("http://127.0.0.1:5173/login",{waitUntil:"domcontentloaded"});
 await page.locator("#login-name").fill(actor.username);
 await page.locator("#login-password").fill(actor.password);
 await page.getByRole("button",{name:"Войти",exact:true}).click();
 await page.waitForURL("**/courses",{timeout:11000});
 if(!(await ctx.cookies()).some(x=>x.name==="gafus_access"))throw Error("LOCAL_TRAINER_AUTH_FAILED");
}
(async()=>{
const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
try{
 for(const [viewport,width,height,action] of [["desktop",1280,800,"create"],["mobile",390,844,"delete"]]){
  const ctx=await b.newContext({viewport:{width,height}});
  await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["blob:","data:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
  const page=await ctx.newPage(),events=[];
  page.on("response",r=>{const u=new URL(r.url());if(u.pathname.includes("/api/v1/trainer/")&&["POST","PUT","DELETE","GET"].includes(r.request().method()))events.push({method:r.request().method(),status:r.status(),path:u.pathname});});
  page.on("response",async r=>{
    if(r.request().method()==="DELETE"&&new URL(r.url()).pathname.includes("/trainer/steps/manage/")){
      const body=await r.json().catch(()=>null);
      console.log("TRAINER_DELETE_HTTP_BODY",JSON.stringify({
        status:r.status(),code:body?.code||null,
        method:r.request().method(),hasRequestBody:!!r.request().postData(),requestContentType:r.request().headers()["content-type"]||null
      }));
    }
  });
  try{
   await login(page,ctx);
   const url=action==="create"?"http://127.0.0.1:"+(process.env.QA_TRAINER_SHARED_ORIGIN==="1"?"5173":"5175")+"/main-panel/steps/new":"http://127.0.0.1:"+(process.env.QA_TRAINER_SHARED_ORIGIN==="1"?"5173":"5175")+"/main-panel/steps/"+createdId+"/edit";
   await page.goto(url,{waitUntil:"domcontentloaded",timeout:15000});
   if(action==="create"){
    await page.getByRole("heading",{name:"Создание шага тренировки"}).waitFor({timeout:12000});
    await page.getByLabel("Название",{exact:true}).fill("QA: проверка шага тренера");
    await page.getByLabel("Описание",{exact:true}).fill("Синтетический шаг для локальной проверки редактора тренера, без внешних медиа.");
    await page.getByRole("button",{name:"Создать шаг",exact:true}).click();
    await page.waitForTimeout(1050);
    console.log("TRAINER_AUTHORING_DIAGNOSTIC",JSON.stringify({
      api:events.slice(-8),alert:(await page.locator('[role=alert]').allTextContents()).map(x=>x.slice(0,160)),
      status:(await page.locator('[role=status]').allTextContents()).map(x=>x.slice(0,130)),
      url:new URL(page.url()).pathname
    }));
    await page.getByText("Шаг создан.",{exact:false}).waitFor({timeout:7000});
    const created=events.find(x=>x.method==="POST"&&x.path==="/api/v1/trainer/authoring/steps");
    if(!created||created.status!==201)throw Error("NO_CONFIRMED_STEP_POST201");
    // Only read synthetic response id, never print owner or PII.
    const db=new Client({connectionString:raw});await db.connect();
    try{const found=await db.query('SELECT id FROM "Step" WHERE "authorId"=$1 AND title=$2 ORDER BY "createdAt" DESC LIMIT 2',[actor.id,"QA: проверка шага тренера"]);
      if(found.rowCount!==1)throw Error("NO_EXACT_SYNTHETIC_DB_STEP");
      createdId=found.rows[0].id;
    }finally{await db.end()}
    results.push({viewport,action,http:201,sql:await sqlRead(),pass:true});
   }else{
    if(!createdId)throw Error("NO_SYNTHETIC_STEP_TO_DELETE");
    await page.getByRole("button",{name:"Удалить",exact:true}).waitFor({timeout:15000});
    page.once("dialog",d=>d.accept());
    await page.getByRole("button",{name:"Удалить",exact:true}).click();
    await page.waitForTimeout(800);
    console.log("TRAINER_DELETE_DIAGNOSTIC",JSON.stringify({
      api:events.slice(-8),alerts:(await page.locator('[role=alert]').allTextContents()).slice(0,4).map(x=>x.slice(0,200)),
      statuses:(await page.locator('[role=status]').allTextContents()).slice(0,4).map(x=>x.slice(0,200)),
      bodyTail:(await page.locator('body').innerText()).slice(-270),path:new URL(page.url()).pathname
    }));
    await page.getByText("Удаление подтверждено сервером.",{exact:false}).waitFor({timeout:7000});
    const deleted=events.find(x=>x.method==="DELETE"&&x.path.endsWith("/"+createdId));
    const readback=events.find(x=>x.method==="GET"&&x.path.endsWith("/"+createdId)&&x.status===404);
    const proof=await sqlRead();
    const pass=deleted?.status===200&&!!readback&&proof.found===0;
    results.push({viewport,action,http:deleted?.status||null,get404:!!readback,sqlAbsent:proof.found===0,pass});
    if(!pass)throw Error("TRAINER_DELETE_NOT_CONFIRMED");
   }
   console.log("REAL_TRAINER_STEP_BROWSER",JSON.stringify(results.at(-1)));
  }finally{await ctx.close()}
 }
}finally{await b.close()}
})().catch(e=>{console.log("TRAINER_STEP_QA_ERROR",String(e.message).slice(0,180));process.exitCode=1}).finally(async()=>{
 const still=await sqlRead().catch(()=>({found:-1}));
 if(still.found===1){await sqlRestore().catch(e=>{console.log("QA_STEP_RECOVERY_ERROR",e.message.slice(0,90));process.exitCode=1})}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/trainer-step-crud.json",JSON.stringify({results,finalDB:await sqlRead().catch(()=>({found:-1}))},null,2));
});
