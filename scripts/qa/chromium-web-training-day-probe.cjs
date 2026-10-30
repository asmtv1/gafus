"use strict";
const fs=require("node:fs");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const actor=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(x=>x.role==="USER");
const fixture=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-training-progress-fixture-20261029.json","utf8"));
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 const ctx=await b.newContext({viewport:{width:1280,height:800}});
 await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["localhost","127.0.0.1"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const p=await ctx.newPage(),requests=[];
 p.on("response",r=>{const u=new URL(r.url());if(u.pathname.startsWith("/api/v1/training")||u.pathname.startsWith("/api/v1/courses"))requests.push({path:u.pathname,status:r.status()})});
 await p.goto("http://127.0.0.1:5173/login");
 await p.locator("#login-name").fill(actor.username);
 await p.locator("#login-password").fill(actor.password);
 await p.getByRole("button",{name:"Войти",exact:true}).click();
 await p.waitForURL("**/courses",{timeout:12500});
 await p.goto("http://127.0.0.1:5173/trainings/"+fixture.type+"/"+fixture.ids.dayOnCourse);
 await p.waitForTimeout(1400);
 const out={
  route:new URL(p.url()).pathname,
  requests:requests.slice(-14),
  headings:(await p.locator("h1,h2,h3,h4").allTextContents()).map(x=>x.trim()).slice(0,14),
  buttons:(await p.locator("main button").allTextContents()).map(x=>x.trim()).filter(Boolean).slice(0,22),
  links:(await p.locator("main a").allTextContents()).map(x=>x.trim()).filter(Boolean).slice(0,18)
 };
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/web-training-day-probe.json",JSON.stringify(out,null,2));
 console.log("WEB_LOCAL_TRAINING_DAY_PROBE",JSON.stringify(out));
 await ctx.close();
 }finally{await b.close()}
})().catch(e=>{console.log("WEB_LOCAL_TRAINING_PROBE_ERROR",String(e.message).slice(0,160));process.exitCode=1});
