"use strict";
const fs=require("fs"),{chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const accounts=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const result=[];
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
  for(const role of ["USER","TRAINER","ADMIN"]){
   const actor=accounts.find(x=>x.role===role),c=await b.newContext(),p=await c.newPage();
   await c.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["blob:","data:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
   try{
    await p.goto("http://127.0.0.1:5173/login");
    await p.locator("#login-name").fill(actor.username);
    await p.locator("#login-password").fill(actor.password);
    await p.getByRole("button",{name:"Войти",exact:true}).click();
    await p.waitForURL("**/courses",{timeout:13000});
    const checks=await p.evaluate(async()=>{
     const paths=["/api/v1/consultations/cynologists","/api/v1/consultations/my","/api/v1/consultations/trainer/bookings","/api/v1/consultations/admin/bookings","/api/v1/consultations/admin/cynologists"];
     const out=[];for(const path of paths){const r=await fetch(path,{credentials:"same-origin"});out.push({endpoint:path.split("/").slice(4).join("/"),status:r.status})}
     return out;
    });
    const observed=checks.map(x=>x.status);
    const expected=role==="USER"?[200,200,403,403,403]:role==="TRAINER"?[200,200,200,403,403]:[200,200,200,200,200];
    if(JSON.stringify(observed)!==JSON.stringify(expected))throw Error("CONSULTATION_ROLE_MATRIX_MISMATCH_"+role);
    result.push({role,http:checks,pass:true});console.log("REAL_CONSULTATION_READ_RBAC_PASS",JSON.stringify(result.at(-1)));
   }finally{await c.close()}
  }
 }finally{await b.close()}
})().catch(e=>{console.log("CONSULTATION_RBAC_ERROR",String(e.message).slice(0,200));process.exitCode=1}).finally(()=>{
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/consultation-rbac-read.json",JSON.stringify(result,null,2));
});
