"use strict";
const fs=require("node:fs");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 const cases=[
  ["WebLogin","http://127.0.0.1:5173/login",true],
  ["WebRegister","http://127.0.0.1:5173/register",false],
  ["WebRecovery","http://127.0.0.1:5173/passwordReset",false],
  ["AdminLogin","http://127.0.0.1:5174/main-panel",true],
  ["TrainerLogin","http://127.0.0.1:5175/main-panel",true],
 ];
 const results=[];
 try {
 for(const [viewport,width,height] of [["desktop",1280,800],["mobile",390,844]]){
  for(const [name,url,login] of cases){
   const ctx=await b.newContext({viewport:{width,height}});
   await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
   const page=await ctx.newPage();
   const responses=[];
   page.on("response",r=>{if(r.url().includes("/api/v1/auth/"))responses.push({status:r.status(),path:new URL(r.url()).pathname})});
   await page.goto(url,{waitUntil:"domcontentloaded",timeout:11000});await page.waitForTimeout(300);
   const buttons=page.locator("form button[type=submit]");
   const submit=await buttons.count();
   const beforeReq=responses.length;
   let invalid=null;
   if(submit){
    await buttons.first().click();
    invalid=await page.locator("form").first().evaluate(f=>!f.checkValidity());
    await page.waitForTimeout(150);
   }
   const noSubmitWithEmpty=responses.length===beforeReq;
   let attemptedInvalidLogin=null;
   if(login&&viewport==="desktop"){
    await page.locator('form input').first().fill("gafus_qa_nonexistent_20261029");
    await page.locator('input[type=password]').first().fill("NOT_A_REAL_PASSWORD_20261029!");
    const start=responses.length;
    await buttons.first().click();
    await page.waitForTimeout(850);
    const api=responses.slice(start);
    attemptedInvalidLogin={api,bodyEnd:(await page.locator("body").innerText()).slice(-220),url:page.url()};
   }
   const record={viewport,app:name,submitButtonExists:submit>0,emptyFormInvalid:invalid,emptyFormDidNotSend:noSubmitWithEmpty,negativeLogin:attemptedInvalidLogin};
   results.push(record);
   console.log("CHROME_FORM",JSON.stringify({...record,negativeLogin:attemptedInvalidLogin?{api:attemptedInvalidLogin.api,url:attemptedInvalidLogin.url}:null}));
   await ctx.close();
  }
 }
 }finally{await b.close()}
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/form-validation-results.json",JSON.stringify(results,null,2));
 if(results.some(x=>!x.submitButtonExists||x.emptyFormInvalid!==true||!x.emptyFormDidNotSend))process.exitCode=1;
})().catch(e=>{console.log("BROWSER_FORMS_ERROR",e.message);process.exitCode=1})
