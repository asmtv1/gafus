"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const actor=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(x=>x.role==="TRAINER");
const cookieFile=".local-pg-scratch/qa-trainer-temporary-cookie-20261029.json";
const apiPid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8",timeout:3000}).trim().split("\n")[0];
const ps=cp.execFileSync("ps",["eww","-p",apiPid,"-o","command="],{encoding:"utf8",timeout:3000});
const raw=ps.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_NONLOCAL_QA_DB");
const titleStep="QA: дневной связанный шаг 20261029";
const titleDay="QA: тренировочный день 20261029";
const titleDayUpdated="QA: день обновлён 20261029";
let stepId=null,dayId=null;
const evidence=[];
const local=()=>new Client({connectionString:raw});
async function readStep(){const c=local();await c.connect();try{
 const q=await c.query('SELECT id,"authorId" FROM "Step" WHERE id=$1',[stepId]);
 return {count:q.rowCount,owned:q.rows[0]?.authorId===actor.id};
}finally{await c.end()}}
async function readDay(){const c=local();await c.connect();try{
 const q=await c.query('SELECT id,"authorId",title FROM "TrainingDay" WHERE id=$1',[dayId]);
 const links=await c.query('SELECT count(*)::int n FROM "StepOnDay" WHERE "dayId"=$1 AND "stepId"=$2',[dayId,stepId]);
 return {count:q.rowCount,owned:q.rows[0]?.authorId===actor.id,title:q.rows[0]?.title,links:links.rows[0].n};
}finally{await c.end()}}
async function findOwnId(table,title){
 if(!["Step","TrainingDay"].includes(table))throw Error("UNSAFE_TABLE");
 const c=local();await c.connect();try{
  const q=await c.query('SELECT id FROM "'+table+'" WHERE "authorId"=$1 AND title=$2',[actor.id,title]);
  if(q.rowCount!==1)throw Error("NOT_EXACTLY_ONE_QA_"+table);
  return q.rows[0].id;
 }finally{await c.end()}
}
async function cleanup(){
 const c=local();await c.connect();try{
  await c.query("BEGIN");
  if(dayId){
   const row=await c.query('SELECT "authorId",title FROM "TrainingDay" WHERE id=$1 FOR UPDATE',[dayId]);
   if(row.rowCount&&row.rows[0].authorId===actor.id&&row.rows[0].title.startsWith("QA:")){
    const course=await c.query('SELECT count(*)::int n FROM "DayOnCourse" WHERE "dayId"=$1',[dayId]);
    if(course.rows[0].n!==0)throw Error("REFUSE_QA_DAY_IN_COURSE");
    await c.query('DELETE FROM "TrainingDay" WHERE id=$1 AND "authorId"=$2',[dayId,actor.id]);console.log("QA_DAY_LOCAL_FALLBACK_CLEANUP");
   }
  }
  if(stepId){
   const row=await c.query('SELECT "authorId",title FROM "Step" WHERE id=$1 FOR UPDATE',[stepId]);
   if(row.rowCount&&row.rows[0].authorId===actor.id&&row.rows[0].title.startsWith("QA:")){
    const links=await c.query('SELECT count(*)::int n FROM "StepOnDay" WHERE "stepId"=$1',[stepId]);
    if(links.rows[0].n!==0)throw Error("REFUSE_QA_STEP_LINKED");
    await c.query('DELETE FROM "Step" WHERE id=$1 AND "authorId"=$2',[stepId,actor.id]);console.log("QA_STEP_LOCAL_FALLBACK_CLEANUP");
   }
  }
  await c.query("COMMIT");
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}finally{await c.end()}
}
const storage=JSON.parse(fs.readFileSync(cookieFile,"utf8"));
if(!storage.cookies?.some(x=>x.name==="gafus_access"&&x.domain==="127.0.0.1"))throw Error("NO_VALID_LOCAL_COOKIE");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try {
 for(const [vp,w,h,action] of [["desktop",1280,800,"create"],["mobile",390,844,"edit-and-delete"]]){
  const ctx=await browser.newContext({viewport:{width:w,height:h}});
  await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
  await ctx.addCookies(storage.cookies);
  const page=await ctx.newPage(),events=[];
  page.on("response",r=>{const p=new URL(r.url()).pathname;if(p.startsWith("/api/v1/trainer/"))events.push({method:r.request().method(),status:r.status(),path:p})});
  try{
   if(action==="create"){
    await page.goto("http://127.0.0.1:5173/main-panel/steps/new",{waitUntil:"domcontentloaded"});
    await page.getByRole("heading",{name:"Создание шага тренировки"}).waitFor({timeout:12000});
    await page.getByLabel("Название",{exact:true}).fill(titleStep);
    await page.getByLabel("Описание",{exact:true}).fill("Локальный синтетический шаг для проверки связывания в тренировочный день.");
    await page.getByRole("button",{name:"Создать шаг",exact:true}).click();
    await page.getByText("Шаг создан.",{exact:false}).waitFor({timeout:10000});
    if(!events.some(e=>e.method==="POST"&&e.path==="/api/v1/trainer/authoring/steps"&&e.status===201))throw Error("STEP_CREATE_NOT_201");
    stepId=await findOwnId("Step",titleStep);
    await page.goto("http://127.0.0.1:5173/main-panel/days/new",{waitUntil:"domcontentloaded"});
    await page.getByRole("heading",{name:"Создание тренировочного дня"}).waitFor({timeout:11000});
    await page.getByLabel("Название дня").fill(titleDay);
    await page.getByLabel("Описание",{exact:true}).fill("Синтетический тренировочный день с одним собственным шагом.");
    await page.getByLabel("Оборудование").fill("QA поводок");
    await page.getByLabel("Показывать путь курса").check();
    const linked=page.getByRole("checkbox",{name:titleStep});
    await linked.waitFor({timeout:12000});
    await linked.check();
    await page.getByRole("button",{name:"Создать день",exact:true}).click();
    await page.getByText("День создан.",{exact:false}).waitFor({timeout:10000});
    if(!events.some(e=>e.method==="POST"&&e.path==="/api/v1/trainer/authoring/days"&&e.status===201))throw Error("DAY_CREATE_NOT_201");
    dayId=await findOwnId("TrainingDay",titleDay);
    const proof=await readDay();
    if(proof.count!==1||!proof.owned||proof.links!==1)throw Error("QA_DAY_STEP_LINK_MISSING");
    evidence.push({viewport:vp,action,stepCreated201:true,dayCreated201:true,sqlOwnerAndStepLink:true,pass:true});
   }else{
    if(!stepId||!dayId)throw Error("NO_LOCAL_QA_STEP_DAY");
    await page.goto("http://127.0.0.1:5173/main-panel/days/"+dayId+"/edit",{waitUntil:"domcontentloaded"});
    await page.getByRole("heading",{name:"Редактирование дня"}).waitFor({timeout:11000});
    await page.getByLabel("Название *").fill(titleDayUpdated);
    await page.getByRole("button",{name:"Сохранить",exact:true}).click();
    await page.getByText("Основные поля подтверждены повторным чтением сервера.",{exact:false}).waitFor({timeout:10000});
    if(!events.some(e=>e.method==="PUT"&&e.path.endsWith("/"+dayId)&&e.status===200))throw Error("QA_DAY_EDIT_NOT_200");
    const edited=await readDay();
    if(edited.title!==titleDayUpdated||edited.links!==1)throw Error("QA_DAY_EDIT_READBACK_FAILED");
    page.once("dialog",d=>d.accept());
    await page.getByRole("button",{name:"Удалить",exact:true}).click();
    await page.getByText("Удаление подтверждено сервером.",{exact:false}).waitFor({timeout:10000});
    if(!events.some(e=>e.method==="DELETE"&&e.path.endsWith("/"+dayId)&&e.status===200)||!events.some(e=>e.method==="GET"&&e.path.endsWith("/"+dayId)&&e.status===404))throw Error("QA_DAY_DELETE_NOT_ACKED");
    if((await readDay()).count!==0)throw Error("QA_DAY_SQL_PRESENT_AFTER_DELETE");
    await page.goto("http://127.0.0.1:5173/main-panel/steps/"+stepId+"/edit",{waitUntil:"domcontentloaded"});
    await page.getByRole("heading",{name:"Редактирование шага"}).waitFor({timeout:11000});
    page.once("dialog",d=>d.accept());
    await page.getByRole("button",{name:"Удалить",exact:true}).click();
    await page.getByText("Удаление подтверждено сервером.",{exact:false}).waitFor({timeout:10000});
    if(!events.some(e=>e.method==="DELETE"&&e.path.endsWith("/"+stepId)&&e.status===200)||!events.some(e=>e.method==="GET"&&e.path.endsWith("/"+stepId)&&e.status===404))throw Error("QA_STEP_DELETE_NOT_ACKED");
    if((await readStep()).count!==0)throw Error("QA_STEP_SQL_PRESENT_AFTER_DELETE");
    evidence.push({viewport:vp,action,dayPut200:true,sqlUpdatedTitleAndLink:true,dayDelete200AndGet404:true,stepDelete200AndGet404:true,sqlBothAbsent:true,pass:true});
   }
   console.log("REAL_TRAINER_DAY_LIFECYCLE",JSON.stringify(evidence.at(-1)));
  }finally{await ctx.close()}
 }
 }finally{await browser.close()}
})().catch(e=>{console.log("TRAINER_DAY_LIFECYCLE_ERROR",String(e.message).slice(0,210));process.exitCode=1}).finally(async()=>{
 try{await cleanup()}catch(e){console.log("TRAINER_DAY_QA_CLEANUP_ERROR",e.message.slice(0,135));process.exitCode=1}
 const final={day:dayId?await readDay():null,step:stepId?await readStep():null};
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/trainer-day-lifecycle.json",JSON.stringify({evidence,final},null,2));
 console.log("TRAINER_DAY_CLEAN_FINAL",{dayAbsent:!final.day?.count,stepAbsent:!final.step?.count,allUIFlow:evidence.length===2&&evidence.every(x=>x.pass)});
});
