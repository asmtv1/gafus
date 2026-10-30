"use strict";
const fs=require("node:fs"),{chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const actor=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(a=>a.role==="USER");
if(!actor)throw Error("MISSING_SYNTHETIC_QA_USER");
const results=[],path="/api/v1/offline/course/download?courseType=qa_local_nonexistent_course_20261029";
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
  for(const [kind,width,height] of [["guest",1280,800],["user",390,844]]){
   const c=await b.newContext({viewport:{width,height}});
   await c.route("**/*",r=>{const x=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(x.hostname)||["blob:","data:"].includes(x.protocol)?r.continue():r.abort("blockedbyclient")});
   const p=await c.newPage();try{
    await p.goto("http://127.0.0.1:5173/login");
    if(kind==="user"){
     await p.locator("#login-name").fill(actor.username);await p.locator("#login-password").fill(actor.password);
     await p.getByRole("button",{name:"Войти",exact:true}).click();await p.waitForURL("**/courses",{timeout:13000});
    }
    const output=await p.evaluate(async endpoint=>{
     const response=await fetch(endpoint,{credentials:"same-origin"});
     const payload=await response.json().catch(()=>null);
     return {http:response.status,code:payload?.code??null,cache:response.headers.get("cache-control")};
    },path);
    const expected=kind==="guest"?401:402;
    if(output.http!==expected||kind==="user"&&output.code!=="SUBSCRIPTION_REQUIRED")
      throw Error("QA_OFFLINE_ENTITLEMENT_GATE_UNEXPECTED_"+kind+"_"+output.http+"_"+output.code);
    results.push({role:kind,viewport:width,status:output.http,code:output.code,pass:true});
    console.log("QA_OFFLINE_COURSE_READONLY_GATE_PASS",JSON.stringify(results.at(-1)));
   }finally{await c.close()}
  }
 }finally{await b.close()}
})().catch(e=>{console.log("QA_OFFLINE_COURSE_GATE_ERROR",String(e.message).slice(0,220));process.exitCode=1}).finally(()=>{
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/offline-course-entitlement-gate.json",JSON.stringify({results,requestsAreReadOnly:true},null,2));
});
