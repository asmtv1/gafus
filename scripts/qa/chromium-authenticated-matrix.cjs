"use strict";
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const artifact=path.resolve(".local-pg-scratch/qa-logs/browser-20261029");
const accounts=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const apps=[
  ["USER","Web","http://127.0.0.1:5173",[
    "/courses","/pets","/moments","/questions","/profile",
    "/articles","/reminders","/chats","/cynologist-chat","/profile/albums",
    "/consultations","/profile?tab=settings","/profile?tab=questions","/profile?tab=notes","/profile?tab=gafus"]],
  ["ADMIN","Admin","http://127.0.0.1:5173",[
    "/main-panel","/main-panel/users","/main-panel/feed-moderation",
    "/main-panel/questions","/main-panel/feature-flags","/main-panel/consultations"]],
  ["TRAINER","Trainer","http://127.0.0.1:5175",[
    "/main-panel","/main-panel/statistics","/main-panel/steps",
    "/main-panel/days","/main-panel/daily-course","/main-panel/my-videos",
    "/main-panel/exam-results","/main-panel/articles",
    "/main-panel/courses/new","/main-panel/steps/new"]],
];
const viewports=[["desktop",1280,800],["mobile",390,844]];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
 args:["--no-first-run","--no-default-browser-check"]});
 const results=[];
 try{
  for(const [vp,width,height] of viewports){
   for(const [role,app,base,routes] of apps){
    const acct=accounts.find(x=>x.role===role);
    if(!acct)throw Error("MISSING_LOCAL_TEST_ROLE_"+role);
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
    await context.route("**/*",r=>{
      const u=new URL(r.request().url());
      return ["127.0.0.1","localhost"].includes(u.hostname)||["blob:","data:"].includes(u.protocol)?
      r.continue():r.abort("blockedbyclient");
    });
    const page=await context.newPage(),authResponses=[];
    page.on("response",r=>{if(new URL(r.url()).pathname==="/api/v1/auth/login")authResponses.push(r.status());});
    await page.goto("http://127.0.0.1:5173/login",{waitUntil:"domcontentloaded",timeout:16000});
    await page.locator("#login-name").fill(acct.username);
    await page.locator("#login-password").fill(acct.password);
    await page.getByRole("button",{name:"Войти",exact:true}).click();
    await page.waitForTimeout(600);
    const loggedIn=authResponses.includes(200)&&(await context.cookies()).some(c=>c.name==="gafus_access");
    console.log("AUTH_REAL_LOGIN",JSON.stringify({app,role,vp,loggedIn,apiLoginStatuses:authResponses,finalPath:new URL(page.url()).pathname}));
    if(!loggedIn){
      results.push({app,role,vp,scenario:"LOGIN",status:"FAIL",apiLoginStatuses:authResponses});
      await context.close();continue;
    }
    for(const route of routes){
      const errors=[],apiStatus=[];
      const onError=e=>errors.push(String(e.message).slice(0,160));
      const onResponse=r=>{
        const u=new URL(r.url());
        if(u.hostname==="127.0.0.1"&&u.pathname.startsWith("/api/v1")&&r.status()>=400)
          apiStatus.push({path:u.pathname,status:r.status()});
      };
      page.on("pageerror",onError);page.on("response",onResponse);
      let documentStatus=null,fail=null;
      try{
        const r=await page.goto(base+route,{waitUntil:"domcontentloaded",timeout:15000});
        documentStatus=r?.status()??null;
        await page.waitForTimeout(340);
      }catch(e){fail=String(e.message).slice(0,150)}
      const current=new URL(page.url()),dom=await page.evaluate(()=>({
        bodyChars:(document.body?.innerText||"").length,
        buttons:[...document.querySelectorAll("button")].filter(x=>x.getBoundingClientRect().width>0).length,
        links:[...document.querySelectorAll("a[href]")].filter(x=>x.getBoundingClientRect().width>0).length,
        inputs:[...document.querySelectorAll("input")].filter(x=>x.getBoundingClientRect().width>0).length,
        headerCount:document.querySelectorAll("h1,h2").length,
        errorFlag:/Сессия изменилась|Страница не найдена|Не удалось загрузить админ-панель|Не удалось проверить авторизацию/.test(document.body?.innerText||""),
        authGate:/Вход в панель тренера|Войдите под учётной записью администратора|^Вход\s/m.test((document.body?.innerText||"").slice(0,200)),
        overflow:document.documentElement.scrollWidth>window.innerWidth+1
      })).catch(()=>({}));
      let status="REVIEW";
      if(fail||errors.length||documentStatus!==200||dom.errorFlag)status="FAIL";
      else if(dom.authGate)status="BLOCKED_AUTH_GATE";
      else if(current.pathname!==route.split("?")[0])status="REDIRECT";
      else status="PAGE_RENDERED";
      const row={app,role,viewport:vp,route,http:documentStatus,finalPath:current.pathname,status,fail,
        ...dom,pageErrors:errors,apiErrors:apiStatus.slice(0,9)};
      results.push(row);
      console.log("AUTH_REAL_ROUTE",JSON.stringify({...row,apiErrors:apiStatus.slice(0,3)}));
      page.off("pageerror",onError);page.off("response",onResponse);
    }
    if(app!=="Admin"){
      const safe=path.join(artifact,app.toLowerCase()+"-authenticated-"+vp+"-synthetic-only.png");
      await page.screenshot({path:safe,fullPage:true}).catch(()=>{});
    }
    await context.close();
   }
  }
 }finally{await browser.close()}
 const out=path.join(artifact,"authenticated-route-matrix.json");
 fs.writeFileSync(out,JSON.stringify({type:"real Chrome + real localhost HTTP + synthetic LOCAL WORK test accounts",results},null,2));
 console.log("AUTH_REAL_SUMMARY",JSON.stringify({rows:results.length,rendered:results.filter(x=>x.status==="PAGE_RENDERED").length,
 blocked:results.filter(x=>x.status==="BLOCKED_AUTH_GATE").length,
 fail:results.filter(x=>x.status==="FAIL").length,redirect:results.filter(x=>x.status==="REDIRECT").length,output:out}));
 if(results.some(r=>r.status==="FAIL"||r.scenario==="LOGIN"))process.exitCode=1;
})().catch(e=>{console.log("AUTH_CHROME_SCRIPT_ERROR",String(e.message).slice(0,250));process.exitCode=1});
