"use strict";
const fs=require("node:fs");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const cred=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const plans=[
 ["ADMIN","Admin","http://127.0.0.1:5173/main-panel",[
  "/main-panel/users","/main-panel/questions","/main-panel/feed-moderation"]],
 ["TRAINER","Trainer","http://127.0.0.1:5175/main-panel",[
  "/main-panel/statistics","/main-panel/steps","/main-panel/days"]]
];
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
const results=[];
try{
for(const [vp,width,height] of [["desktop",1280,800],["mobile",390,844]]){
for(const [role,app,url,routes] of plans){
const a=cred.find(x=>x.role===role),ctx=await browser.newContext({viewport:{width,height}});
await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
const page=await ctx.newPage(),errors=[];
page.on("pageerror",e=>errors.push(String(e.message).slice(0,140)));
try{
await page.goto("http://127.0.0.1:5173/login",{waitUntil:"domcontentloaded"});
await page.locator("#login-name").fill(a.username);
await page.locator("#login-password").fill(a.password);
await page.getByRole("button",{name:"Войти",exact:true}).click();
await page.waitForTimeout(350);
if(!(await ctx.cookies()).some(c=>c.name==="gafus_access"))throw Error("AUTH_FAILED");
await page.goto(url,{waitUntil:"domcontentloaded",timeout:12000});
const root=app==="Admin"?"#admin-root .admin-layout":".trainer-shell";
await page.locator(root).waitFor({timeout:14000});
for(const route of routes){
  if(app==="Admin"){
    const sidebar=page.locator("#admin-root aside.sidebar");
    if(await sidebar.count()){
      const show=await sidebar.first().evaluate(el=>getComputedStyle(el).visibility!=="hidden"&&el.getBoundingClientRect().width>0);
      const toggle=page.locator("#admin-root button.menu-toggle");
      if(vp==="mobile"&&await toggle.count()&&!(await sidebar.first().evaluate(el=>el.classList.contains("open")))){
        await toggle.click({timeout:3000});
      }
    }
  }
  const link=page.locator('a[href="'+route+'"]').first();
  let status="FAIL",problem=null;
  try{
    await link.click({timeout:7000});
    await page.waitForTimeout(380);
    status=new URL(page.url()).pathname===route&&errors.length===0?"PASS":"FAIL";
  }catch(e){problem=String(e.message).slice(0,140)}
  const x={app,role,viewport:vp,route,status,problem,errors:errors.slice(-2)};
  results.push(x);
  console.log("ADMIN_TRAINER_REAL_NAV_CLICK",JSON.stringify(x));
  if(status!=="PASS")break;
}
}catch(e){results.push({app,role,viewport:vp,route:"setup",status:"BLOCKED",problem:String(e.message).slice(0,150)})}
finally{await ctx.close()}
}
}
}finally{await browser.close()}
fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/admin-trainer-real-nav-clicks.json",JSON.stringify(results,null,2));
console.log("ADMIN_TRAINER_NAV_SUMMARY",{checks:results.length,passed:results.filter(x=>x.status==="PASS").length});
if(results.some(x=>x.status!=="PASS"))process.exitCode=1;
})().catch(e=>{console.log("ADMIN_TRAINER_NAV_FATAL",String(e.message).slice(0,140));process.exitCode=1});
