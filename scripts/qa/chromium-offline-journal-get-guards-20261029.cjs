"use strict";
const fs=require("node:fs"),crypto=require("node:crypto"),{chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const actors=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const user=actors.find(x=>x.role==="USER"),trainer=actors.find(x=>x.role==="TRAINER");
if(!user||!trainer||user.id===trainer.id)throw Error("QA_ACTORS_NOT_VALID");
const eventId=crypto.randomUUID();
const path="/api/v1/offline/mutations/"+eventId;
const results=[];
async function run(page,url,headers){
 return page.evaluate(async({url,headers})=>{
  const res=await fetch(url,{headers,credentials:"same-origin",cache:"no-store"});
  const body=await res.json().catch(()=>null);
  return {status:res.status,code:body?.code??null,cache:res.headers.get("cache-control")};
 },{url,headers});
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
  for(const [role,actor,width,height] of [["GUEST",null,1280,800],["USER",user,390,844],["TRAINER",trainer,1280,800]]){
   const ctx=await browser.newContext({viewport:{width,height}});
   await ctx.route("**/*",route=>{const u=new URL(route.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?route.continue():route.abort("blockedbyclient")});
   const page=await ctx.newPage();
   try{
    await page.goto("http://127.0.0.1:5173/login");
    if(actor){
     await page.locator("#login-name").fill(actor.username);await page.locator("#login-password").fill(actor.password);
     await page.getByRole("button",{name:"Войти",exact:true}).click();await page.waitForURL("**/courses",{timeout:12500});
    }
    const tests=role==="GUEST"
     ?[{kind:"unauthenticated",path,headers:{"x-gafus-sync-protocol":"2"},expected:401,code:null}]
     :[
       {kind:"missing version header",path,headers:{},expected:400,code:"UNSUPPORTED_SYNC_PROTOCOL"},
       {kind:"bad UUID",path:"/api/v1/offline/mutations/not-a-uuid",headers:{"x-gafus-sync-protocol":"2"},expected:400,code:"INVALID_EVENT_ID"},
       {kind:"valid unknown receipt",path,headers:{"x-gafus-sync-protocol":"2"},expected:404,code:"NOT_FOUND"},
      ];
    for(const t of tests){
     const res=await run(page,t.path,t.headers);
     if(res.status!==t.expected||t.code&&res.code!==t.code||(role!=="GUEST"&&!res.cache?.includes("no-store")))
      throw Error("QA_JOURNAL_GUARD_MISMATCH_"+role+"_"+t.kind+"_"+JSON.stringify(res));
     results.push({role,width,kind:t.kind,http:res.status,code:res.code,noStore:res.cache?.includes("no-store")??false,pass:true});
    }
    console.log("QA_OFF021_REAL_GET_GUARDS_PASS",JSON.stringify({role,checks:tests.length}));
   }finally{await ctx.close()}
  }
 }finally{await browser.close()}
})().catch(e=>{console.log("QA_OFF021_REAL_GET_GUARD_ERROR",String(e.message).slice(0,245));process.exitCode=1}).finally(()=>{
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/offline-journal-get-guards.json",JSON.stringify({results,readOnly:true,randomUnseenUuidNotPrinted:true},null,2));
});
