const fs=require("fs"),{chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const a=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json")).find(x=>x.role==="TRAINER");
(async()=>{const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});try{
const c=await b.newContext({viewport:{width:1280,height:800}});
await c.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
const p=await c.newPage(),calls=[];p.on("response",r=>{const u=new URL(r.url());if(u.pathname.startsWith("/api/v1/auth"))calls.push({path:u.pathname,status:r.status(),method:r.request().method()})});
await p.goto("http://127.0.0.1:5173/main-panel/consultations/availability");
await p.getByRole("heading",{name:"Вход в панель тренера"}).waitFor({timeout:10000});
await p.locator('input[autocomplete="username"]').fill(a.username);
await p.locator('input[type="password"]').fill(a.password);
await p.getByRole("button",{name:"Войти",exact:true}).click();await p.waitForTimeout(1250);
console.log("TRAINER_BROWSER_LOGIN_SAFE_DIAG",JSON.stringify({path:new URL(p.url()).pathname,calls,alerts:(await p.locator('[role="alert"]').allTextContents()).map(x=>x.slice(0,140)),headings:(await p.locator('h1,h2').allTextContents()).slice(0,5),cookieNames:(await c.cookies()).map(x=>x.name).filter(x=>x.startsWith("gafus"))}));
await c.close();
}finally{await b.close()}})().catch(e=>{console.log("TRAINER_BROWSER_LOGIN_SAFE_ERROR",e.message.slice(0,180));process.exitCode=1})
