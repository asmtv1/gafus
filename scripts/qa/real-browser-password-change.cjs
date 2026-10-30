"use strict";
const fs=require("node:fs"),crypto=require("node:crypto");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const store=".local-pg-scratch/qa-browser-accounts-20261029.json";
const people=JSON.parse(fs.readFileSync(store,"utf8")),actor=people.find(x=>x.role==="USER");
if(!actor||actor.username!=="qa_preprod_user_20261029")throw Error("WRONG_QA_ACCOUNT");
const next="Qa!9"+crypto.randomBytes(22).toString("base64url")+"wR2";
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
try{
 const ctx=await browser.newContext({viewport:{width:1280,height:800}});
 await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const page=await ctx.newPage(),calls=[];
 page.on("response",r=>{const u=new URL(r.url());if(u.pathname==="/api/v1/auth/login"||u.pathname==="/api/v1/auth/change-password"||u.pathname==="/api/v1/auth/logout")calls.push({path:u.pathname,status:r.status()})});
 await page.goto("http://127.0.0.1:5173/login");
 await page.locator("#login-name").fill(actor.username);
 await page.locator("#login-password").fill(actor.password);
 await page.getByRole("button",{name:"Войти",exact:true}).click();
 await page.waitForTimeout(300);
 if(!(await ctx.cookies()).some(x=>x.name==="gafus_access"))throw Error("OLD_LOGIN_FAILED");
 await page.goto("http://127.0.0.1:5173/profile/change-password");
 await page.getByRole("heading",{name:"Сменить пароль"}).waitFor({timeout:12000});
 await page.locator("#account-current-password").fill(actor.password);
 await page.locator("#account-new-password").fill(next);
 await page.locator("#account-confirm-password").fill(next);
 await page.locator('form button[type="submit"]').click();
 await page.waitForTimeout(1200);
 const changed=calls.some(x=>x.path==="/api/v1/auth/change-password"&&x.status===200);
 const current=new URL(page.url()).pathname;
 if(!changed){
   console.log("PASSWORD_QA_CHANGE_RESULT",JSON.stringify({changed:false,finalPath:current,events:calls}));
   process.exitCode=1;await ctx.close();return;
 }
 // Old credentials are invalid after the mutation; update only the ignored local secret store.
 people.find(x=>x.role==="USER").password=next;
 const tmp=store+".tmp";
 fs.writeFileSync(tmp,JSON.stringify(people,null,2),{mode:0o600});
 fs.chmodSync(tmp,0o600);fs.renameSync(tmp,store);fs.chmodSync(store,0o600);
 // Check newly minted credentials in the actual browser without exposing the secret.
 await page.goto("http://127.0.0.1:5173/login");
 await page.locator("#login-name").fill(actor.username);
 await page.locator("#login-password").fill(next);
 await page.getByRole("button",{name:"Войти",exact:true}).click();
 await page.waitForTimeout(550);
 const verified=calls.filter(x=>x.path==="/api/v1/auth/login").at(-1)?.status===200;
 const result={changed,verifiedNewLogin:verified,finalPath:new URL(page.url()).pathname,
  changeCalls:calls.filter(x=>x.path==="/api/v1/auth/change-password"),loginStatuses:calls.filter(x=>x.path==="/api/v1/auth/login").map(x=>x.status),
  emailNotificationsDisabledBySyntheticNullEmail:true,credentialsStoreUpdated:true};
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/real-password-change.json",JSON.stringify(result,null,2));
 console.log("REAL_PASSWORD_CHANGE_RESULT",JSON.stringify(result));
 if(!verified)process.exitCode=1;
 await ctx.close();
}finally{await browser.close()}
})().catch(e=>{console.log("REAL_PASSWORD_CHANGE_ERROR",String(e.message).slice(0,180));process.exitCode=1})
