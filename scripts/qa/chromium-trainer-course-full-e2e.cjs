"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const actor=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(x=>x.role==="TRAINER");
const storage=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-trainer-temporary-cookie-20261029.json","utf8"));
if(!actor||!storage.cookies?.some(x=>x.name==="gafus_access"&&x.domain==="127.0.0.1"))throw Error("QA_TRAINER_IDENTITY_NOT_READY");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const text=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"});
const raw=text.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.port!=="55921"||u.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_NONLOCAL_QA_PG");
const firstName="QA: проверка полного редактора курса 20261029",secondName="QA: обновлённый курс редактора 20261029";
let courseId=null;const evidence=[],api=[];
async function readCourse(){const c=new Client({connectionString:raw});await c.connect();try{
 const q=courseId?await c.query('select id,name,"authorId",version,"isPaid","isPrivate" from "Course" where id=$1',[courseId]):{rowCount:0,rows:[]};
 const links=courseId?await c.query('select count(*)::int n from "DayOnCourse" where "courseId"=$1',[courseId]):{rows:[{n:0}]};
 return {rows:q.rowCount,name:q.rows[0]?.name,owned:q.rows[0]?.authorId===actor.id,version:q.rows[0]?.version,public:!q.rows[0]?.isPrivate&&!q.rows[0]?.isPaid,links:links.rows[0].n};
}finally{await c.end()}}
async function findCreated(){const c=new Client({connectionString:raw});await c.connect();try{
 const q=await c.query('select id from "Course" where "authorId"=$1 and name=$2',[actor.id,firstName]);
 if(q.rowCount!==1)throw Error("EXPECTED_EXACTLY_ONE_OWN_SYNTHETIC_COURSE");return q.rows[0].id;
}finally{await c.end()}}
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 for(const [viewport,width,height,action] of [["desktop",1280,800,"create"],["mobile",390,844,"edit-delete"]]){
  const ctx=await b.newContext({viewport:{width,height}});
  await ctx.route("**/*",r=>{const url=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(url.hostname)||["data:","blob:"].includes(url.protocol)?r.continue():r.abort("blockedbyclient")});
  await ctx.addCookies(storage.cookies);
  const page=await ctx.newPage(),requests=[];
  page.on("response",r=>{const uri=new URL(r.url()).pathname;if(uri.startsWith("/api/v1/trainer/courses")&&!["GET"].includes(r.request().method()))requests.push({method:r.request().method(),status:r.status(),path:uri})});
  try{
   const target=action==="create"?"http://127.0.0.1:5173/main-panel/courses/new":"http://127.0.0.1:5173/main-panel/courses/"+courseId+"/edit";
   await page.goto(target,{waitUntil:"domcontentloaded"});
   const main=page.locator("main");
   if(action==="create"){
    await page.getByRole("heading",{name:"Создание курса"}).waitFor({timeout:14000});
    await page.getByLabel("Название *").fill(firstName);
    await page.getByLabel("Краткое описание").fill("Полностью локальный синтетический курс для проверки версии и удаления.");
    await page.getByLabel("Описание",{exact:true}).fill("QA: локальный контроль полноценного редактора, без участников и внешних медиа.");
    await page.getByLabel("Длительность *").fill("3 дня");
    await page.getByRole("button",{name:"Создать курс",exact:true}).click();
    await page.getByText("Сервер подтвердил создание курса.",{exact:false}).waitFor({timeout:11500});
    courseId=await findCreated();
    const proof=await readCourse();
    if(proof.rows!==1||!proof.owned||proof.public!==true||proof.links!==0||proof.name!==firstName)throw Error("COURSE_CREATE_SQL_MISMATCH");
    evidence.push({viewport,action,post201:requests.some(r=>r.method==="POST"&&r.status===201),owned:proof.owned,public:proof.public,version:proof.version,pass:true});
   }else{
    if(!courseId)throw Error("NO_QA_COURSE_FOR_EDIT");
    await page.getByRole("heading",{name:"Редактирование курса"}).waitFor({timeout:12000});
    const before=await readCourse();
    await page.getByLabel("Название *").fill(secondName);
    await page.getByRole("button",{name:"Сохранить курс",exact:true}).click();
    await page.getByText("Курс сохранён. Поля и версия подтверждены сервером.",{exact:false}).waitFor({timeout:12000});
    const after=await readCourse();
    if(after.name!==secondName||after.version!==before.version+1)throw Error("COURSE_CAS_VERSION_READBACK_FAILED");
    page.once("dialog",d=>d.accept());
    await page.getByRole("button",{name:"Удалить курс",exact:true}).click();
    await page.getByText("Удаление курса подтверждено сервером.",{exact:false}).waitFor({timeout:12000});
    const removed=await readCourse();
    if(removed.rows!==0)throw Error("COURSE_SQL_STILL_EXISTS");
    evidence.push({viewport,action,put200:requests.some(r=>r.method==="PUT"&&r.status===200),oldVersion:before.version,newVersion:after.version,delete200:requests.some(r=>r.method==="DELETE"&&r.status===200),sqlAbsent:true,pass:true});
   }
   api.push({viewport,requests});
   console.log("REAL_TRAINER_FULL_COURSE_QA",JSON.stringify(evidence.at(-1)));
  }catch(e){
   console.log("TRAINER_COURSE_UI_DIAGNOSTIC",JSON.stringify({viewport,step:action,alerts:(await page.locator('[role=alert]').allTextContents().catch(()=>[])).slice(0,4).map(x=>x.slice(0,150)),status:(await page.locator('[role=status]').allTextContents().catch(()=>[])).slice(0,4).map(x=>x.slice(0,150)),requests}));
   throw e;
  }finally{await ctx.close()}
 }
 }finally{await b.close()}
})().catch(e=>{console.log("TRAINER_FULL_COURSE_QA_ERROR",String(e.message).slice(0,230));process.exitCode=1}).finally(async()=>{
 const final=await readCourse().catch(()=>({rows:-1}));
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/trainer-full-course-e2e.json",JSON.stringify({evidence,api,final,courseId},null,2));
 console.log("TRAINER_COURSE_LOCAL_FINAL",{courseIdPresent:!!courseId,rows:final.rows,allPass:evidence.length===2&&evidence.every(x=>x.pass)});
 if(final.rows===1)process.exitCode=1;
});
