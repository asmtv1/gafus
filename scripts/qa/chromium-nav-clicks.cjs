"use strict";
const fs=require("node:fs");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const creds=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const plans=[
 ["USER","Web","http://127.0.0.1:5173/courses",[
  ["a[href='/pets']","/pets"],["a[href='/questions']","/questions"]]],
 ["ADMIN","Admin","http://127.0.0.1:5173/main-panel",[
  ["a[href='/main-panel/users']","/main-panel/users"],["a[href='/main-panel/questions']","/main-panel/questions"]]],
 ["TRAINER","Trainer","http://127.0.0.1:5175/main-panel",[
  ["a[href='/main-panel/statistics']","/main-panel/statistics"],["a[href='/main-panel/steps']","/main-panel/steps"]]]
];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 const results=[];
 try{
  for(const [role,app,url,clicks] of plans.filter(([role])=>role==="USER")){
   const a=creds.find(x=>x.role===role);
   const ctx=await browser.newContext({viewport:{width:390,height:844}});
   await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
   const p=await ctx.newPage(),errs=[];
   p.on("pageerror",e=>errs.push(e.message.slice(0,100)));
   await p.goto("http://127.0.0.1:5173/login",{waitUntil:"domcontentloaded"});
   await p.locator("#login-name").fill(a.username);await p.locator("#login-password").fill(a.password);
   await p.getByRole("button",{name:"Войти",exact:true}).click();await p.waitForTimeout(280);
   if(app!=="Web")await p.goto(url,{waitUntil:"domcontentloaded"});
   await p.waitForTimeout(900);
   console.log("NAV_DIAGNOSTIC",JSON.stringify({app,role,initialPath:new URL(p.url()).pathname,
     appVisible:(await p.evaluate(()=>!!document.querySelector("#root")?.shadowRoot)),
     pageButtons:await p.locator("button").count(),linkCount:await p.locator("a[href]").count()}));
   if(app==="Web"){
      const intro=p.getByRole("dialog",{name:"Экскурсия по GAFUS"});
      if(await intro.count() && await intro.isVisible()){
        const skip=p.getByRole("button",{name:"Пропустить"});
        if(await skip.count()){
          await skip.click({timeout:3500});
          await p.waitForTimeout(500);
          console.log("REAL_ONBOARDING_SKIP",{tourGone:(await intro.count())===0,url:new URL(p.url()).pathname});
        }
      }

   }
   for(const [selector,target] of clicks){
    if(app==="Web"){
      const open=p.getByRole("button",{name:"Открыть меню"});
      if(await open.count())await open.click({timeout:3500});
    }
    const locator=p.locator(selector).first();
    const matches=await locator.count();
    let error=null;
    if(matches){
     try{await locator.click({timeout:3500});await p.waitForTimeout(400)}
     catch(e){error=String(e.message).slice(0,110)}
    }
    const row={app,role,selector,target,matches:matches>0,finalPath:new URL(p.url()).pathname,clickError:error,jsErrors:errs.length};
    row.status=matches&&row.finalPath===target&&!error&&!errs.length?"PASS":"FAIL";
    results.push(row);console.log("REAL_CHROME_CLICK",JSON.stringify(row));
    if(row.status!=="PASS")break;
   }
   await ctx.close();
  }
 }finally{await browser.close()}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/role-nav-clicks.json",JSON.stringify(results,null,2));
 console.log("REAL_NAV_CLICK_SUMMARY",{checks:results.length,passed:results.filter(x=>x.status==="PASS").length});
 if(results.some(x=>x.status!=="PASS"))process.exitCode=1;
})().catch(e=>{console.log("REAL_NAV_CLICK_ERROR",String(e.message).slice(0,150));process.exitCode=1});
