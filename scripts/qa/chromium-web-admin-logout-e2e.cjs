"use strict";
const fs=require("node:fs"),{chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const actors=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const qaUser=actors.find(x=>x.role==="USER"),qaAdmin=actors.find(x=>x.role==="ADMIN");
if(!qaUser||!qaAdmin||qaUser.id===qaAdmin.id)throw Error("QA_IDENTITIES_NOT_ISOLATED");
const report=[];
async function probe(page,url){
 return page.evaluate(async endpoint=>{
   const r=await fetch(endpoint,{credentials:"same-origin",cache:"no-store"});
   return r.status;
 },url);
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 for(const [role,viewport] of [["WEB_USER","mobile"],["ADMIN","desktop"]]){
  const ctx=await browser.newContext({viewport:viewport==="mobile"?{width:390,height:844}:{width:1280,height:800}});
  await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
  const page=await ctx.newPage(),requests=[];
  page.on("response",r=>{const url=new URL(r.url());if(url.pathname==="/api/v1/auth/logout"&&r.request().method()==="POST")requests.push({code:r.status(),method:"POST"})});
  try{
   const admin=role==="ADMIN",actor=admin?qaAdmin:qaUser;
   await page.goto(admin?"http://127.0.0.1:5173/main-panel":"http://127.0.0.1:5173/login");
   if(admin){
     await page.getByRole("heading",{name:"Админ-панель GAFUS"}).waitFor({timeout:12000});
     await page.getByRole("textbox",{name:"Логин"}).fill(actor.username);
     await page.getByRole("textbox",{name:"Пароль"}).fill(actor.password);
     await page.getByRole("button",{name:"Войти",exact:true}).click();
     await page.locator(".admin-layout").waitFor({timeout:12000});
   }else{
     await page.locator("#login-name").fill(actor.username);await page.locator("#login-password").fill(actor.password);
     await page.getByRole("button",{name:"Войти",exact:true}).click();
     await page.waitForURL("**/courses",{timeout:12000});
   }
   const before=await probe(page,"/api/v1/auth/me");
   if(before!==200)throw Error("AUTH_SESSION_BEFORE_NOT_200_"+before);
   if(admin){
      await page.getByRole("button",{name:"Выйти",exact:true}).click();
      await page.getByRole("heading",{name:"Админ-панель GAFUS"}).waitFor({timeout:12000});
   }else{
      await page.goto("http://127.0.0.1:5173/login");
      await page.getByRole("button",{name:"Выйти",exact:true}).waitFor({timeout:12000});
      await page.getByRole("button",{name:"Выйти",exact:true}).click();
      await page.locator("#login-name").waitFor({timeout:12500});
   }
   if(!requests.some(x=>x.code===200))throw Error("UI_LOGOUT_NO_HTTP200");
   const after=await probe(page,"/api/v1/auth/me");
   if(after!==401)throw Error("AUTH_SESSION_NOT_REVOKED_"+after);
   await page.goto(admin?"http://127.0.0.1:5173/main-panel/users":"http://127.0.0.1:5173/profile");
   if(admin){
     await page.getByRole("heading",{name:"Админ-панель GAFUS"}).waitFor({timeout:12000});
     if(await page.locator(".admin-layout").count())throw Error("ADMIN_PRIVATE_LAYOUT_LEAKED");
   }else{
     await page.waitForURL(url=>!new URL(url).pathname.startsWith("/profile"),{timeout:12000});
     if(await page.getByText(actor.username,{exact:true}).count())throw Error("USER_PROFILE_RENDERED_AFTER_LOGOUT");
   }
   report.push({role,viewport,authBefore:200,logoutHTTP:200,authAfter:401,privateRouteDenied:true,pass:true});
   console.log("QA_SESSION_LOGOUT_STEP_PASS",JSON.stringify(report.at(-1)));
  }catch(e){console.log("QA_SESSION_LOGOUT_STEP_FAIL",JSON.stringify({role,reason:String(e.message).slice(0,260),requests}));throw e}
  finally{await ctx.close()}
 }
 }finally{await browser.close()}
})().catch(e=>{console.log("QA_SESSION_LOGOUT_ERROR",String(e.message).slice(0,260));process.exitCode=1}).finally(()=>{
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/web-admin-logout-e2e.json",JSON.stringify({checks:report},null,2));
});
