"use strict";
const fs=require("node:fs");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const account=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(a=>a.role==="USER");
const pet=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-logs/browser-20261029/real-pet-create.json","utf8"));
if(!pet.confirmed||!/^\/pets\/[A-Za-z0-9_-]+$/.test(pet.petPath))throw Error("NO_CONFIRMED_QA_PET");
(async()=>{
const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
try{
 const ctx=await b.newContext({viewport:{width:1280,height:800}});
 await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const p=await ctx.newPage(),requests=[];
 p.on("response",r=>{const u=new URL(r.url());if(u.pathname.startsWith("/api/v1/pets/"))requests.push({method:r.request().method(),status:r.status(),detail:true})});
 await p.goto("http://127.0.0.1:5173/login");
 await p.locator("#login-name").fill(account.username);
 await p.locator("#login-password").fill(account.password);
 await p.getByRole("button",{name:"Войти",exact:true}).click();
 await p.waitForTimeout(360);
 if(!(await ctx.cookies()).some(x=>x.name==="gafus_access"))throw Error("AUTHENTICATION_FAILED");
 await p.goto("http://127.0.0.1:5173"+pet.petPath);
 await p.getByRole("button",{name:"Удалить питомца",exact:true}).waitFor({timeout:11000});
 await p.getByRole("button",{name:"Удалить питомца",exact:true}).click();
 await p.getByRole("button",{name:"Да, удалить",exact:true}).click();
 await p.waitForTimeout(1100);
 const result={scenario:"real Chrome controlled local QA pet delete",finalPath:new URL(p.url()).pathname,deleteRequests:requests.filter(x=>x.method==="DELETE"),readBack:requests.filter(x=>x.method==="GET")};
 result.pass=result.finalPath==="/pets"&&result.deleteRequests.some(x=>x.status===200)&&result.readBack.some(x=>x.status===404);
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/real-pet-delete.json",JSON.stringify(result,null,2));
 console.log("REAL_PET_DELETE_RESULT",JSON.stringify(result));
 await ctx.close();
 if(!result.pass)process.exitCode=1;
}finally{await b.close()}
})().catch(e=>{console.log("REAL_PET_DELETE_ERROR",String(e.message).slice(0,170));process.exitCode=1});
