"use strict";
const fs=require("node:fs");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const accounts=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const combos=[
 ["ADMIN","Admin","http://127.0.0.1:5173/main-panel",["/main-panel/users","/main-panel/questions","/main-panel/feed-moderation"]],
 ["TRAINER","Trainer","http://127.0.0.1:5175/main-panel",["/main-panel/statistics","/main-panel/steps","/main-panel/days"]],
 ["USER","Web","http://127.0.0.1:5173/courses",["/pets","/moments","/questions"]]
];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 const results=[];
 try{
 for(const [vp,w,h] of [["desktop",1280,800],["mobile",390,844]]){
 for(const [role,app,start,routes] of combos){
   const c=accounts.find(x=>x.role===role);
   const ctx=await browser.newContext({viewport:{width:w,height:h}});
   await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
   const page=await ctx.newPage();
   const errors=[], statuses=[];
   page.on("pageerror",e=>errors.push(String(e.message).slice(0,120)));
   page.on("response",r=>{let u=new URL(r.url());if(u.pathname.startsWith("/api/v1")&&r.status()>=400)statuses.push({path:u.pathname,status:r.status()})});
   try{
    await page.goto("http://127.0.0.1:5173/login",{waitUntil:"domcontentloaded",timeout:12000});
    await page.locator("#login-name").fill(c.username,{timeout:4500});
    await page.locator("#login-password").fill(c.password,{timeout:4500});
    await page.getByRole("button",{name:"Войти",exact:true}).click();
    await page.waitForTimeout(350);
    let logged=(await ctx.cookies()).some(x=>x.name==="gafus_access");
    if(!logged){results.push({app,vp,route:"login",status:"FAIL_LOGIN",errors,apiErrors:statuses.slice(-3)});continue}
    await page.goto(start,{waitUntil:"domcontentloaded",timeout:13000});
    await page.waitForTimeout(1200);
    for(const [index,r] of [new URL(start).pathname,...routes].entries()){
      if(index>0){
        // Browser History API SPA transition; no simulated network response.
        await page.evaluate(next=>{history.pushState(null,"",next);window.dispatchEvent(new PopStateEvent("popstate"))},r);
        await page.waitForTimeout(450);
      }
      const dom=await page.evaluate(()=>{
       const root=document.querySelector("#root");
       const container=root?.shadowRoot?.querySelector("#admin-root")||root||document.body;
       const text=container?.textContent||"";
       const els=[...container.querySelectorAll("button,a,input")].filter(x=>x.getBoundingClientRect().width>0);
       return {visibleControls:els.length,buttons:els.filter(x=>x.tagName==="BUTTON").length,links:els.filter(x=>x.tagName==="A").length,
        errorState:/Состояние сессии неизвестно|Не удалось проверить авторизацию|Ошибка авторизации|Сессия изменилась/.test(text),
        authGate:/Войдите под учётной записью администратора|Вход в панель тренера/.test(text.slice(0,300)),
        containsContent:text.length>50,overflow:document.documentElement.scrollWidth>innerWidth+1};
      });
      const row={app,vp,route:r,finalPath:new URL(page.url()).pathname,...dom,jsErrors:errors.slice(-3),apiErrors:statuses.slice(-5)};
      row.status=errors.length||dom.errorState?"FAIL":dom.authGate?"BLOCKED_AUTH_GATE":dom.visibleControls>0?"UI_RENDERED":"BLOCKED_EMPTY";
      results.push(row);
      console.log("ROLE_SPA_REAL_CHROME",JSON.stringify(row));
      if(dom.errorState||dom.authGate||statuses.some(x=>x.status===429))break;
    }
   }catch(e){results.push({app,vp,route:"setup",status:"BLOCKED",reason:String(e.message).slice(0,150)});console.log("ROLE_SPA_BLOCKED",app,vp,String(e.message).slice(0,100))}
   finally{await ctx.close()}
 }
 }
 }finally{await browser.close()}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/authenticated-role-spa.json",JSON.stringify(results,null,2));
 console.log("ROLE_SPA_SUMMARY",{rows:results.length,rendered:results.filter(x=>x.status==="UI_RENDERED").length,blocked:results.filter(x=>x.status!=="UI_RENDERED").length});
})().catch(e=>{console.log("ROLE_SPA_FATAL",String(e.message).slice(0,180));process.exitCode=1});
