"use strict";
const fs=require("node:fs"),cp=require("node:child_process"),{Client}=require("pg");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const account=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(x=>x.role==="USER");
const fixture=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-training-progress-fixture-20261029.json","utf8"));
const pid=cp.execFileSync("lsof",["-t","-nP","-iTCP:3001","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split("\n")[0];
const ps=cp.execFileSync("ps",["eww","-p",pid,"-o","command="],{encoding:"utf8"});
const raw=ps.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1],dburl=new URL(raw);
if(dburl.hostname!=="127.0.0.1"||dburl.port!=="55921"||dburl.pathname!=="/gafus_refactor_real_work_20261024"||fixture.localOnly!==true||fixture.learnerId!==account.id)throw Error("REFUSE_NONLOCAL_QA_TRAINING");
const url="http://127.0.0.1:5173/trainings/"+fixture.type+"/"+fixture.ids.dayOnCourse;
const evidence=[];
async function readProgress(){const c=new Client({connectionString:raw});await c.connect();try{
const rows=await c.query('SELECT us.status,ut."userId",us."stepOnDayId" FROM "UserStep" us JOIN "UserTraining" ut ON ut.id=us."userTrainingId" WHERE ut."dayOnCourseId"=$1 AND us."stepOnDayId"=$2',[fixture.ids.dayOnCourse,fixture.ids.stepOnDay]);
const uc=await c.query('SELECT status FROM "UserCourse" WHERE "courseId"=$1 AND "userId"=$2',[fixture.ids.course,fixture.learnerId]);
return {steps:rows.rowCount,own:rows.rows[0]?.userId===fixture.learnerId,status:rows.rows[0]?.status,courseStatus:uc.rows[0]?.status||null};
}finally{await c.end()}}
async function login(ctx,page){await page.goto("http://127.0.0.1:5173/login");await page.locator("#login-name").fill(account.username);await page.locator("#login-password").fill(account.password);await page.getByRole("button",{name:"Войти",exact:true}).click();await page.waitForURL("**/courses",{timeout:13000})}
(async()=>{const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});try{
for(const [vp,w,h,action] of [["desktop",1280,800,"complete"],["mobile",390,844,"readback"]]){
 const ctx=await b.newContext({viewport:{width:w,height:h}});await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["localhost","127.0.0.1"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const page=await ctx.newPage(),reqs=[];page.on("response",r=>{const u=new URL(r.url());if(u.pathname.startsWith("/api/v1/training"))reqs.push({method:r.request().method(),path:u.pathname,status:r.status()})});
 try{
 await login(ctx,page);await page.goto(url);
 await page.getByRole("button",{name:"Подробнее: "+fixture.names.step}).waitFor({timeout:11000});
 await page.getByRole("button",{name:"Подробнее: "+fixture.names.step}).click();
 if(action==="complete"){
  const go=page.getByRole("button",{name:"Я выполнил: "+fixture.names.step});
  await go.waitFor({timeout:11000});
  await go.click();
  await page.getByText("Упражнение выполнено",{exact:true}).waitFor({timeout:12500});
  const proof=await readProgress();
  if(!reqs.some(r=>r.method==="POST"&&r.path.endsWith("/step/complete/practice")&&r.status===200)||proof.steps!==1||!proof.own||proof.status!=="COMPLETED")throw Error("QA_LEARNER_COMPLETION_NOT_CONFIRMED");
  evidence.push({viewport:vp,action,post200:true,stepSqlCompleted:true,courseStatus:proof.courseStatus,pass:true});
 }else{
  await page.getByText("Упражнение выполнено",{exact:true}).waitFor({timeout:12000});
  const proof=await readProgress();
  if(proof.status!=="COMPLETED"||!proof.own)throw Error("QA_MOBILE_PERSISTED_PROGRESS_MISSING");
  evidence.push({viewport:vp,action,visibleCompleted:true,ownerSql:true,pass:true});
 }
 console.log("REAL_WEB_LEARNER_TRAINING",JSON.stringify(evidence.at(-1)));
 }catch(e){
  console.log("WEB_LEARNER_DIAG",JSON.stringify({viewport:vp,action,requests:reqs,alerts:(await page.locator("[role=alert]").allTextContents().catch(()=>[])).slice(0,3).map(s=>s.slice(0,125)),buttons:(await page.locator("main button").allTextContents().catch(()=>[])).map(s=>s.trim()).filter(Boolean).slice(-8)}));throw e;
 }finally{await ctx.close()}
}
}finally{await b.close()}
})().catch(e=>{console.log("REAL_WEB_LEARNER_TRAINING_ERROR",String(e.message).slice(0,220));process.exitCode=1}).finally(async()=>{
 const final=await readProgress().catch(()=>null);
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/learner-training-e2e.json",JSON.stringify({evidence,final},null,2));
 console.log("REAL_WEB_TRAINING_FINAL",{pass:evidence.length===2&&evidence.every(x=>x.pass),status:final?.status,owned:final?.own});
});
