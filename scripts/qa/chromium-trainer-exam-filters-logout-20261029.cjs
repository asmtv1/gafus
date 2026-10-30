"use strict";
const fs=require("fs"),{chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const trainer=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(a=>a.role==="TRAINER");
if(!trainer)throw Error("NO_QA_TRAINER");
const checks=[];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
  for(const [vp,width,height] of [["desktop",1280,800],["mobile",390,844]]){
   const context=await browser.newContext({viewport:{width,height}});
   await context.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["blob:","data:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
   const page=await context.newPage(),events=[];
   page.on("response",r=>{const u=new URL(r.url()).pathname;if(u==="/api/v1/trainer/exam-results/manage")events.push({method:r.request().method(),status:r.status()});if(u==="/api/v1/auth/logout"&&r.request().method()==="POST")events.push({method:"LOGOUT",status:r.status()})});
   try{
    await page.goto("http://127.0.0.1:5173/main-panel");
    await page.getByRole("heading",{name:"Вход в панель тренера"}).waitFor({timeout:13000});
    await page.getByRole("textbox",{name:"Логин"}).fill(trainer.username);
    await page.getByRole("textbox",{name:"Пароль"}).fill(trainer.password);
    await page.getByRole("button",{name:"Войти",exact:true}).click();
    const nav=page.getByRole("navigation",{name:"Разделы панели тренера"});await nav.waitFor({timeout:14000});
    await nav.getByRole("link",{name:"Экзамены на проверке"}).click();
    await page.getByRole("heading",{name:"Результаты экзаменов"}).waitFor({timeout:14000});
    const hidden=page.getByRole("checkbox",{name:"Скрывать завершённые"});
    if(!(await hidden.isChecked()))throw Error("TRAINER_EXAM_INITIAL_FILTER_WRONG");
    await hidden.uncheck();
    await page.getByRole("combobox",{name:"Тип"}).selectOption("video");
    await page.getByRole("combobox",{name:"Сортировка"}).selectOption("course");
    if(await hidden.isChecked())throw Error("TRAINER_EXAM_FILTER_NOT_UPDATED");
    await page.getByRole("button",{name:"Обновить результаты"}).click();
    await page.getByRole("heading",{name:"Результаты экзаменов"}).waitFor({timeout:14000});
    if(!events.some(e=>e.method==="GET"&&e.status===200)||events.some(e=>!["GET","LOGOUT"].includes(e.method)))throw Error("TRAINER_EXAM_GET_NOT_200_OR_WRITE");
    checks.push({viewport:vp,check:"Exam filters and reload",http200:true,filterUpdated:true,writeRequests:0,pass:true});
    console.log("QA_TRAINER_EXAM_FILTER_STEP_PASS",JSON.stringify(checks.at(-1)));
    const before=await page.evaluate(async()=> (await fetch("/api/v1/auth/me",{cache:"no-store",credentials:"same-origin"})).status);
    if(before!==200)throw Error("TRAINER_LOGOUT_SESSION_WAS_NOT_AUTHENTICATED");
    await page.getByRole("button",{name:"Выйти",exact:true}).click();
    await page.getByRole("heading",{name:"Вход в панель тренера"}).waitFor({timeout:12000});
    const after=await page.evaluate(async()=> (await fetch("/api/v1/auth/me",{cache:"no-store",credentials:"same-origin"})).status);
    if(after!==401||!events.some(e=>e.method==="LOGOUT"&&e.status===200))throw Error("TRAINER_LOGOUT_NOT_REVOKED");
    checks.push({viewport:vp,check:"trainer real UI logout and protected data",before200:true,logout200:true,after401:true,pass:true});
    console.log("QA_TRAINER_LOGOUT_STEP_PASS",JSON.stringify(checks.at(-1)));
   }finally{await context.close()}
  }
 }finally{await browser.close()}
})().catch(e=>{console.log("QA_TRAINER_EXAM_LOGOUT_ERROR",String(e.message).slice(0,260));process.exitCode=1}).finally(()=>{
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/trainer-exam-filter-logout.json",JSON.stringify({checks},null,2));
});
