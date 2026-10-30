"use strict";
const fs=require("fs"),{chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const actors=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const user=actors.find(x=>x.role==="USER"),trainer=actors.find(x=>x.role==="TRAINER");
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 const ctx=await b.newContext({viewport:{width:390,height:844}});
 await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const page=await ctx.newPage();
 await page.goto("http://127.0.0.1:5173/login");
 await page.locator("#login-name").fill(user.username);
 await page.locator("#login-password").fill(user.password);
 await page.getByRole("button",{name:"Войти",exact:true}).click();await page.waitForURL("**/courses",{timeout:12000});
 const check=await page.evaluate(async trainerId=>{
  const status=await fetch("/api/v1/app-subscription/status",{credentials:"same-origin"});
  const parsed=await status.json().catch(()=>null);
  const access=parsed?.data?.hasActiveSubscription??parsed?.hasActiveSubscription??null;
  const slotUrl="/api/v1/consultations/cynologists/"+encodeURIComponent(trainerId)+"/slots?from=2026-11-02T00%3A00%3A00.000Z&to=2026-11-03T00%3A00%3A00.000Z";
  const r=await fetch(slotUrl,{credentials:"same-origin"});
  const data=await r.json().catch(()=>null);
  return {subscriptionHttp:status.status,active:access,slotsHttp:r.status,code:data?.code??null,cache:r.headers.get("cache-control")};
 },trainer.id);
 if(check.subscriptionHttp!==200||check.active!==false||check.slotsHttp!==402||check.code!=="SUBSCRIPTION_REQUIRED")
  throw Error("CONSULTATION_NO_SUBSCRIPTION_NOT_FAIL_CLOSED");
 console.log("CONSULTATION_SUBSCRIPTION_DENIAL_REAL_MOBILE_PASS",JSON.stringify(check));
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/consultation-subscription-denial.json",JSON.stringify(check,null,2));
 await ctx.close();
 }finally{await b.close()}
})().catch(e=>{console.log("CONSULTATION_SUBSCRIPTION_DENIAL_ERROR",String(e.message).slice(0,180));process.exitCode=1});
