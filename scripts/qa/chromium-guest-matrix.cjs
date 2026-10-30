"use strict";
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const destination=path.resolve(".local-pg-scratch/qa-logs/browser-20261029");
fs.mkdirSync(destination,{recursive:true});
const apps=[
  ["Web","http://127.0.0.1:5173",["/","/login","/register","/passwordReset","/courses","/moments","/pets"]],
  ["Admin","http://127.0.0.1:5174",["/","/main-panel","/main-panel/users","/main-panel/feed-moderation"]],
  ["Trainer","http://127.0.0.1:5175",["/","/main-panel","/main-panel/statistics","/main-panel/courses"]]
];
const widths=[["desktop",1280,800],["mobile",390,844]];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",args:["--no-first-run","--no-default-browser-check"]});
 const results=[];
 try{
  for(const [app,base,paths] of apps){
   for(const [vp,width,height] of widths){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
    await context.route("**/*",route=>{
     const url=new URL(route.request().url());
     const safe=["127.0.0.1","localhost"].includes(url.hostname) || ["data:","blob:"].includes(url.protocol);
     return safe?route.continue():route.abort("blockedbyclient");
    });
    const page=await context.newPage();
    for(const pathPart of paths){
     const errorMessages=[];
     const browserErrors=[];
     const refused=[];
     const handleConsole=msg=>{if(msg.type()==="error")errorMessages.push(msg.text().slice(0,160));};
     const handlePage=e=>browserErrors.push(String(e.message).slice(0,160));
     const handleFailed=r=>{if(r.failure()?.errorText==="net::ERR_BLOCKED_BY_CLIENT")refused.push(new URL(r.url()).hostname);};
     page.on("console",handleConsole);
     page.on("pageerror",handlePage);
     page.on("requestfailed",handleFailed);
     let status=null,fail=null;
     try{
      const response=await page.goto(base+pathPart,{waitUntil:"domcontentloaded",timeout:13000});
      status=response?.status()??null;
      await page.waitForTimeout(450);
     }catch(e){fail=String(e.message).slice(0,130);}
     const fields=await page.evaluate(()=>({
      title:document.title,
      bodyText:(document.body?.innerText||"").slice(0,350),
      visibleButtons:[...document.querySelectorAll("button")].filter(el=>el.getBoundingClientRect().width>0).map(el=>(el.innerText||el.getAttribute("aria-label")||"").trim().slice(0,60)).slice(0,18),
      forms:document.querySelectorAll("form").length,
      inputs:[...document.querySelectorAll("input")].map(el=>({type:el.type,required:el.required})),
      hrefs:[...document.querySelectorAll("a[href]")].slice(0,25).map(el=>el.getAttribute("href")).filter(Boolean),
      horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth+1
     })).catch(()=>({}));
     const screenshot=app.toLowerCase()+"-"+vp+"-"+pathPart.replace(/[^a-zA-Z0-9]/g,"-").replace(/^-$/,"root")+".png";
     if(pathPart==="/"||pathPart==="/login"||pathPart==="/main-panel"||pathPart==="/register") {
      await page.screenshot({path:path.join(destination,screenshot),fullPage:true}).catch(()=>{});
     }
     results.push({app,viewport:vp,path:pathPart,status,finalUrl:page.url(),fail,
      ...fields,consoleErrors:[...new Set(errorMessages)].slice(0,8),
      pageErrors:[...new Set(browserErrors)].slice(0,8),blockedExternalHosts:[...new Set(refused)]});
     console.log("CHROMIUM_REAL_HTTP",JSON.stringify({app,viewport:vp,path:pathPart,status,finalUrl:page.url(),pageErrors:browserErrors.length,consoleErrors:errorMessages.length,fail}));
     page.off("console",handleConsole);page.off("pageerror",handlePage);page.off("requestfailed",handleFailed);
    }
    await context.close();
   }
  }
 }finally{await browser.close()}
 fs.writeFileSync(path.join(destination,"guest-matrix-results.json"),JSON.stringify({browser:"Playwright chromium actual Google Chrome",version:"156.0.8078.74",results},null,2));
 console.log("CHROMIUM_REAL_MATRIX_SUMMARY",JSON.stringify({routes:results.length,http200:results.filter(x=>x.status===200).length,errors:results.filter(x=>x.fail||x.pageErrors?.length).length,artifact:path.join(destination,"guest-matrix-results.json")}));
 if(results.some(x=>x.fail))process.exitCode=1;
})().catch(e=>{console.log("CHROMIUM_MATRIX_EXCEPTION",e.message);process.exitCode=1});
