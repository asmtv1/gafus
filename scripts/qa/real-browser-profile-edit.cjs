"use strict";
const fs=require("node:fs");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const user=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(x=>x.role==="USER");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 await context.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const page=await context.newPage(),requests=[];
 page.on("response",r=>{const u=new URL(r.url());if(u.pathname==="/api/v1/user/profile")requests.push({method:r.request().method(),status:r.status()})});
 await page.goto("http://127.0.0.1:5173/login");
 await page.locator("#login-name").fill(user.username);
 await page.locator("#login-password").fill(user.password);
 await page.getByRole("button",{name:"Войти",exact:true}).click();
 await page.waitForTimeout(300);
 await page.goto("http://127.0.0.1:5173/profile/editBio");
 await page.locator("#profile-edit-name").waitFor({timeout:10000});
 await page.locator("#profile-edit-name").fill("QA Профиль");
 await page.locator("#profile-edit-city").fill("Самара");
 await page.locator("#profile-edit-about").fill("Тестовая учётная запись Refactor");
 await page.locator('form[aria-label="Редактирование профиля"] button[type="submit"]').click();
 await page.waitForTimeout(950);
 const result={scenario:"local real Chrome profile edit",finalPath:new URL(page.url()).pathname,
   putRequests:requests.filter(x=>x.method==="PUT"),ownReadBack:requests.filter(x=>x.method==="GET"),
   visibleQANickname:(await page.locator("body").innerText()).includes("QA Профиль")};
 result.pass=result.putRequests.some(x=>x.status===200)&&result.ownReadBack.some(x=>x.status===200)&&result.finalPath==="/profile"&&result.visibleQANickname;
 console.log("REAL_QA_PROFILE_EDIT",JSON.stringify(result));
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/real-profile-edit.json",JSON.stringify(result,null,2));
 await context.close();
 if(!result.pass)process.exitCode=1;
 }finally{await browser.close()}
})().catch(e=>{console.log("REAL_QA_PROFILE_EDIT_ERROR",String(e.message).slice(0,160));process.exitCode=1})
