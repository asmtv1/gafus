"use strict";
const fs=require("node:fs"),{chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const users=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const cases=[["USER","desktop",1280,800],["ADMIN","mobile",390,844]];
const data=[],path="/api/v1/auth/me";
const actor=role=>users.find(x=>x.role===role);
async function whoami(p){
 return p.evaluate(async path=>{
  const r=await fetch(path,{credentials:"same-origin",headers:{"Accept":"application/json"}});
  const j=await r.json().catch(()=>null);
  return {status:r.status,id:j?.data?.id??null,success:j?.success??null};
 },path);
}
async function signIn(p,a){
 await p.goto("http://127.0.0.1:5173/login");
 await p.locator("#login-name").fill(a.username);
 await p.locator("#login-password").fill(a.password);
 await p.getByRole("button",{name:"Войти",exact:true}).click();
 await p.waitForURL("**/courses",{timeout:14000});
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 for(const [role,viewport,width,height] of cases){
 const a=actor(role);if(!a)throw Error("MISSING_QA_"+role);
 const c=await browser.newContext({viewport:{width,height}});await c.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["blob:","data:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const p=await c.newPage(),logoutResponses=[];
 p.on("response",r=>{const pathname=new URL(r.url()).pathname;if(pathname==="/api/v1/auth/logout"&&r.request().method()==="POST")logoutResponses.push(r.status())});
 try{
 await signIn(p,a);
 const before=await whoami(p);if(before.status!==200||before.id!==a.id)throw Error("QA_LOGOUT_PREAUTH_NOT_OWN_ROLE_"+role);
 const consent=p.getByRole("button",{name:"Отклонить",exact:true});
 if(await consent.isVisible().catch(()=>false))await consent.click({timeout:4500});
 if(role==="USER"){
  await p.goto("http://127.0.0.1:5173/profile?tab=settings");
  const btn=p.getByRole("button",{name:"Выйти из аккаунта",exact:true});
  await btn.waitFor({timeout:14000});
  await btn.click({timeout:8500});
 }else{
  await p.goto("http://127.0.0.1:5173/main-panel");
  await p.locator(".admin-layout").waitFor({timeout:16000});
  const btn=p.getByRole("button",{name:"Выйти",exact:true});
  await btn.click({timeout:8500});
 }
 await p.waitForFunction(()=>!document.querySelector("button:disabled"),null,{timeout:4000}).catch(()=>{});
 await p.waitForTimeout(700);
 if(logoutResponses.length!==1||logoutResponses[0]!==200)throw Error("QA_LOGOUT_HTTP_NOT_ACK_"+role+"_"+JSON.stringify(logoutResponses));
 const after=await whoami(p);
 if(after.status!==401||after.id!==null)throw Error("QA_LOGOUT_COOKIE_STILL_AUTHORIZED_"+role+"_"+after.status);
 if(role==="USER"){
  await p.goto("http://127.0.0.1:5173/pets",{waitUntil:"domcontentloaded"});
  await p.waitForTimeout(700);
  if(new URL(p.url()).pathname==="/pets"&&await p.locator("[data-pet-card]").count()>0)
    throw Error("PRIVATE_PETS_VISIBLE_AFTER_LOGOUT");
 }else{
  await p.goto("http://127.0.0.1:5173/main-panel/users",{waitUntil:"domcontentloaded"});
  await p.waitForTimeout(450);
  if(await p.locator(".admin-layout").count())throw Error("ADMIN_LAYOUT_VISIBLE_AFTER_LOGOUT");
 }
 data.push({role,viewport,loginMe200:true,logoutPost200:true,afterLogoutMe401:true,privateRouteFailClosed:true,pass:true});
 console.log("QA_BROWSER_LOGOUT_PASS",JSON.stringify(data.at(-1)));
 }catch(e){console.log("QA_BROWSER_LOGOUT_STEP_ERROR",role,String(e.message).slice(0,220),JSON.stringify({responses:logoutResponses}));throw e}
 finally{await c.close()}
 }
 }finally{await browser.close()}
})().catch(e=>{console.log("QA_BROWSER_LOGOUT_ERROR",String(e.message).slice(0,220));process.exitCode=1}).finally(()=>{
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/logout-crossrole-e2e.json",JSON.stringify({data},null,2));
});
