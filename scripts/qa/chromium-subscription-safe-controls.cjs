"use strict";
const fs=require("node:fs");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const account=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8")).find(x=>x.role==="USER");
const rows=[];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 for(const [label,width,height] of [["desktop",1280,800],["mobile",390,844]]){
 const ctx=await browser.newContext({viewport:{width,height}});
 await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
 const p=await ctx.newPage(),calls=[];
 p.on("response",r=>{const x=new URL(r.url()).pathname;if(x.startsWith("/api/v1/app-subscription"))calls.push({method:r.request().method(),route:x,status:r.status()})});
 try{
 await p.goto("http://127.0.0.1:5173/login");await p.locator("#login-name").fill(account.username);await p.locator("#login-password").fill(account.password);await p.getByRole("button",{name:"Войти",exact:true}).click();await p.waitForURL("**/courses",{timeout:12000});
 await p.goto("http://127.0.0.1:5173/subscription");
 const opts=p.getByRole("radiogroup",{name:"Тарифы подписки"}).getByRole("radio");
 await opts.first().waitFor({timeout:12500});
 const count=await opts.count();if(count<2)throw Error("SUBSCRIPTION_FEWER_THAN_TWO_PLANS");
 await opts.nth(1).click();if(await opts.nth(1).getAttribute("aria-checked")!=="true")throw Error("SUBSCRIPTION_RADIO_SELECTION_FAILED");
 await opts.first().click();if(await opts.first().getAttribute("aria-checked")!=="true")throw Error("SUBSCRIPTION_RADIO_RESELECTION_FAILED");
 let invalidPromo="not shown";
 const promo=p.locator("#subscription-promo-code");
 if(await promo.count()&&await promo.isVisible()){
 await promo.fill("!");
 await p.getByRole("button",{name:"Применить",exact:true}).click();
 await p.getByText("Проверьте формат промокода.",{exact:true}).waitFor({timeout:7000});
 invalidPromo="client rejects invalid code without network";
 }
 const offer=calls.find(x=>x.method==="GET"&&x.route==="/api/v1/app-subscription/offer");
 const status=calls.find(x=>x.method==="GET"&&x.route==="/api/v1/app-subscription/status");
 if(!offer||offer.status!==200||!status||status.status!==200)throw Error("SUBSCRIPTION_READ_HTTP_NOT_OK");
 if(calls.some(x=>x.method!=="GET"))throw Error("UNEXPECTED_PAYMENT_OR_PROMO_NETWORK_WRITE");
 const row={viewport:label,plans:count,switchRadio:true,invalidPromo,offer:offer.status,status:status.status,realWriteCount:0,pass:true};
 rows.push(row);console.log("SUBSCRIPTION_REAL_CHROME_SAFE_PASS",JSON.stringify(row));
 }finally{await ctx.close()}
 }
 }finally{await browser.close()}
})().catch(e=>{console.log("SUBSCRIPTION_SAFE_CONTROL_ERROR",String(e.message).slice(0,200));process.exitCode=1}).finally(()=>{
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/subscription-safe-controls.json",JSON.stringify(rows,null,2));
});
