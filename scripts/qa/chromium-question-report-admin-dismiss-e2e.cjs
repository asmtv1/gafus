"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const all=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const actors=Object.fromEntries(all.filter(a=>["USER","TRAINER","ADMIN"].includes(a.role)).map(a=>[a.role,a]));
if(Object.keys(actors).length!==3||new Set(Object.values(actors).map(a=>a.id)).size!==3)throw Error("REFUSE_QA_IDENTITIES");
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8",timeout:3000}).trim().split("\n")[0];
const ps=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8",timeout:3000});
const urlString=ps.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],dbUrl=new URL(urlString);
if(dbUrl.hostname!=="127.0.0.1"||dbUrl.port!=="55921"||dbUrl.pathname!=="/gafus_refactor_real_work_20261024")throw Error("REFUSE_NONLOCAL_QA_DB");
const title="QA: сквозная жалоба и решение администратора 20261029";
const details="QA-only: локальная жалоба синтетического тренера, безопасный отказ от блокировки";
let questionId=null,reportId=null;
const checks=[],http=[];
async function db(fn){const c=new Client({connectionString:urlString});await c.connect();try{return await fn(c)}finally{await c.end()}}
async function snapshot(){return db(async c=>{
 const q=await c.query('SELECT id,title,"authorId","deletedAt","hiddenAt" FROM "Question" WHERE title=$1 AND "authorId"=$2',[title,actors.USER.id]);
 const r=await c.query('SELECT qr.id,qr."reporterId",qr."questionId",qr."resolvedAt",qr.resolution FROM "QuestionReport" qr JOIN "Question" q ON q.id=qr."questionId" WHERE q.title=$1 AND q."authorId"=$2',[title,actors.USER.id]);
 return {questions:q.rows,reports:r.rows};
})}
async function cleanup(){
 const pre=await snapshot();
 if(!pre.questions.length&&!pre.reports.length){console.log("QA_CROSS_APP_ALL_OWN_FIXTURES_ABSENT");return}
 if(pre.questions.length!==1||pre.questions[0].authorId!==actors.USER.id||pre.questions[0].title!==title||pre.questions[0].hiddenAt)throw Error("REFUSE_UNRELATED_QA_QUESTION");
 if(pre.reports.some(r=>r.reporterId!==actors.TRAINER.id||r.questionId!==pre.questions[0].id))throw Error("REFUSE_NONQA_QUESTION_REPORT");
 const c=new Client({connectionString:urlString});await c.connect();
 try{
 await c.query("BEGIN");
 try{
 const q=pre.questions[0];
 const counts=await c.query('SELECT (SELECT count(*)::int FROM "QuestionAnswer" WHERE "questionId"=$1) answers,(SELECT count(*)::int FROM "QuestionPhoto" WHERE "questionId"=$1) photos,(SELECT count(*)::int FROM "QuestionView" WHERE "questionId"=$1) views',[q.id]);
 if(counts.rows[0].answers!==0||counts.rows[0].photos!==0)throw Error("REFUSE_QA_QUESTION_WITH_ANSWERS_OR_MEDIA");
 if(pre.reports.length){
  await c.query('DELETE FROM "QuestionReport" WHERE "questionId"=$1 AND "reporterId"=$2',[q.id,actors.TRAINER.id]);
 }
 const del=await c.query('DELETE FROM "Question" WHERE id=$1 AND title=$2 AND "authorId"=$3',[q.id,title,actors.USER.id]);
 if(del.rowCount!==1)throw Error("QA_QUESTION_HARD_DELETE_ROW_COUNT");
 await c.query("COMMIT");
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}
 }finally{await c.end()}
 const after=await snapshot();if(after.questions.length||after.reports.length)throw Error("QA_CLEANUP_SQL_NOT_EMPTY");
 console.log("QA_CROSS_APP_QUESTION_AND_REPORT_ONLY_CLEANUP_PASS",{ownQuestion:1,ownReports:pre.reports.length});
}
async function login(page,a){
 await page.goto("http://127.0.0.1:5173/login",{waitUntil:"domcontentloaded"});
 await page.locator("#login-name").fill(a.username);await page.locator("#login-password").fill(a.password);
 await page.getByRole("button",{name:"Войти",exact:true}).click();
 await page.waitForURL("**/courses",{timeout:12000});
}
(async()=>{
 const pre=await snapshot();if(pre.questions.length||pre.reports.length)throw Error("REFUSE_EXISTING_QA_TITLE");
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 for(const [role,width,height] of [["USER",390,844],["TRAINER",1280,800],["ADMIN",1280,800]]){
 const ctx=await browser.newContext({viewport:{width,height}});
 await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const page=await ctx.newPage();const requests=[];
 page.on("response",r=>{const p=new URL(r.url()).pathname;if((p.startsWith("/api/v1/questions")||p.startsWith("/api/v1/admin/moderation/questions"))&&r.request().method()!=="GET")requests.push({method:r.request().method(),status:r.status(),path:p})});
 try{
 await login(page,actors[role]);
 if(role==="USER"){
  await page.goto("http://127.0.0.1:5173/questions/new");
  await page.getByRole("heading",{name:"Задать вопрос"}).waitFor({timeout:11000});
  await page.locator("#question-title").fill(title);
  await page.locator("#question-body").fill("Локальный синтетический QA вопрос, исключительно для cross-app проверки жалоб в админке.");
  await page.locator("#question-tags").fill("qa, проверка");
  await page.getByRole("button",{name:"Опубликовать вопрос"}).click();
  await page.waitForURL(u=>/^\/questions\/[a-zA-Z0-9_-]+$/.test(new URL(u).pathname)&&new URL(u).pathname!=="/questions/new",{timeout:12000});
  questionId=new URL(page.url()).pathname.split("/").pop();
  const rows=await snapshot();
  if(rows.questions.length!==1||rows.questions[0].id!==questionId)throw Error("QA_QUESTION_CREATION_SQL_FAIL");
  checks.push({role,action:"create synthetic question",post200:requests.some(x=>x.method==="POST"&&x.status===200),ownerSQL:true,pass:true});
 }else if(role==="TRAINER"){
  await page.goto("http://127.0.0.1:5173/questions/"+questionId);
  const button=page.getByRole("button",{name:"Пожаловаться на вопрос"});
  await button.waitFor({timeout:14000});
  const skip=page.getByRole("button",{name:"Пропустить"});if(await skip.count()&&await skip.first().isVisible())await skip.first().click();
  await button.click();
  const form=page.getByRole("form",{name:"Жалоба на вопрос"});
  await form.getByLabel("Комментарий (необязательно)").fill(details);
  await form.getByRole("button",{name:"Отправить жалобу"}).click();
  await page.getByText("Жалоба отправлена на рассмотрение.").waitFor({timeout:13000});
  const rows=await snapshot();
  if(rows.reports.length!==1||rows.reports[0].reporterId!==actors.TRAINER.id||rows.reports[0].questionId!==questionId)throw Error("QA_REPORT_DB_READBACK_FAILED");
  reportId=rows.reports[0].id;
  checks.push({role,action:"report question",reportDbOwn:true,pass:true});
 }else{
  await page.goto("http://127.0.0.1:5173/main-panel/questions");
  await page.getByRole("heading",{name:"Вопросы: модерация"}).waitFor({timeout:15000});
  const card=page.locator("article.moderation-report").filter({hasText:title});
  await card.waitFor({timeout:14000});
  await page.getByRole("textbox",{name:"Причина решения / блокировки"}).fill("QA only: отклонить синтетическую жалобу без блокировки");
  await card.getByRole("button",{name:"Отклонить жалобу"}).click();
  await card.waitFor({state:"detached",timeout:13000});
  const rows=await snapshot();
  if(rows.reports.length!==1||rows.reports[0].id!==reportId||!rows.reports[0].resolvedAt||!rows.reports[0].resolution?.startsWith("dismiss:"))throw Error("QA_REPORT_MODERATION_SQL_FAILED");
  if(rows.questions[0]?.hiddenAt||rows.questions[0]?.deletedAt)throw Error("MODERATOR_DISMISS_MODIFIED_QUESTION");
  checks.push({role,action:"dismiss QA complaint",http200:requests.some(x=>x.method==="POST"&&x.status===200),resolvedSQL:true,preservedContent:true,pass:true});
 }
 http.push({role,requests});console.log("QA_CROSS_APP_QUESTION_MODERATION_STEP",JSON.stringify(checks.at(-1)));
 }catch(e){console.log("QA_CROSS_APP_STEP_FAILED",JSON.stringify({role,error:String(e.message).slice(0,170),requests}));throw e}
 finally{await ctx.close()}
 }
 }finally{await browser.close()}
})().catch(e=>{console.log("QA_CROSS_APP_QUESTION_MODERATION_ERROR",String(e.message).slice(0,200));process.exitCode=1}).finally(async()=>{
 try{await cleanup()}catch(e){console.log("QA_QUESTION_REPORT_CLEANUP_ERROR",String(e.message).slice(0,180));process.exitCode=1}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/cross-app-question-moderation.json",JSON.stringify({checks,http,finalOwnedFixtures:await snapshot().then(x=>({questions:x.questions.length,reports:x.reports.length})).catch(()=>null)},null,2));
});
