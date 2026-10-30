"use strict";
const fs=require("node:fs");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const credentials=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 const results=[];
 try{
 for(const role of ["USER","TRAINER","ADMIN"]){
  const a=credentials.find(x=>x.role===role);
  if(!a)throw Error("MISSING_TEST_ACCOUNT");
  const ctx=await b.newContext({viewport:{width:1280,height:800}});
  await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["blob:","data:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
  const page=await ctx.newPage(),exceptions=[];
  page.on("pageerror",e=>exceptions.push(String(e.message).slice(0,100)));
  let httpStatus=null;
  try{
   await page.goto("http://127.0.0.1:5173/login",{waitUntil:"domcontentloaded"});
   await page.locator("#login-name").fill(a.username);
   await page.locator("#login-password").fill(a.password);
   await page.getByRole("button",{name:"Войти",exact:true}).click();
   await page.waitForTimeout(330);
   if(!(await ctx.cookies()).some(c=>c.name==="gafus_access"))throw Error("QA_LOGIN_FAILED");
   httpStatus=await page.evaluate(async()=>{
    const r=await fetch("/api/v1/admin/users",{credentials:"include",cache:"no-store"});
    return r.status;
   });
   await page.goto("http://127.0.0.1:5173/main-panel",{waitUntil:"domcontentloaded"});
   await page.waitForTimeout(800);
   const gated=await page.evaluate(()=>{
    const root=document.querySelector("#root"),content=root?.shadowRoot?.textContent||"";
    return {accessDenied:content.includes("Доступ запрещён"),adminPanel:content.includes("GAFUS / Панель управления"),hasAdminLayout:!!root?.shadowRoot?.querySelector(".admin-layout")};
   });
   const expected=role==="ADMIN"?200:403;
   const pass=httpStatus===expected&&exceptions.length===0&&(role==="ADMIN"?gated.hasAdminLayout:gated.accessDenied);
   results.push({role,adminGetStatus:httpStatus,expected,gated,jsExceptions:exceptions.length,pass});
   console.log("REAL_CHROME_ROLE_BOUNDARY",JSON.stringify(results.at(-1)));
  }catch(e){results.push({role,pass:false,blocked:String(e.message).slice(0,130),status:httpStatus});console.log("REAL_CHROME_ROLE_BOUNDARY_BLOCKED",JSON.stringify(results.at(-1)));}
  await ctx.close();
 }
 }finally{await b.close()}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/real-role-boundary.json",JSON.stringify(results,null,2));
 console.log("ROLE_BOUNDARY_RESULT",{checks:results.length,passed:results.filter(x=>x.pass).length});
 if(results.some(x=>!x.pass))process.exitCode=1;
})().catch(e=>{console.log("ROLE_BOUNDARY_FATAL",String(e.message).slice(0,180));process.exitCode=1});
