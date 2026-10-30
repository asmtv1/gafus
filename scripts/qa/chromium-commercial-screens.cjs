const fs=require("fs");
const {chromium}=require("../../.local-pg-scratch/qa-playwright/node_modules/playwright-core");
const acc=JSON.parse(fs.readFileSync(".local-pg-scratch/qa-browser-accounts-20261029.json","utf8"));
const results=[];
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 try{
 for(const [role,width,height] of [["USER",1280,800],["USER",390,844],["TRAINER",1280,800],["ADMIN",1280,800]]){
  if (process.env.QA_ONLY_ROLE && process.env.QA_ONLY_ROLE !== role) continue;
  const a=acc.find(x=>x.role===role),ctx=await b.newContext({viewport:{width,height}});
  await ctx.route("**/*",r=>{const u=new URL(r.request().url());return ["127.0.0.1","localhost"].includes(u.hostname)||["data:","blob:"].includes(u.protocol)?r.continue():r.abort("blockedbyclient")});
  const p=await ctx.newPage(),responses=[];
  p.on("response",r=>{const path=new URL(r.url()).pathname;if(/consultation|subscription|checkout|promo/.test(path))responses.push({method:r.request().method(),path,status:r.status()})});
  try{
   await p.goto("http://127.0.0.1:5173/login");
   await p.locator("#login-name").fill(a.username);
   await p.locator("#login-password").fill(a.password);
   await p.getByRole("button",{name:"Войти",exact:true}).click();
   await p.waitForURL("**/courses",{timeout:12000});
   for(const route of ["/consultations","/consultations/my","/subscription"]){
    await p.goto("http://127.0.0.1:5173"+route,{waitUntil:"domcontentloaded"});
    await p.waitForTimeout(1000);
    const entry={role,viewport:width+"x"+height,route,headings:(await p.locator("h1,h2").allTextContents()).slice(0,5),alerts:(await p.locator('[role="alert"]').allTextContents()).slice(0,4).map(x=>x.slice(0,145)),statuses:(await p.locator('[role="status"]').allTextContents()).slice(0,4).map(x=>x.slice(0,145)),calls:responses.slice(-6)};
    results.push(entry);console.log("COMMERCIAL_SCREEN",JSON.stringify(entry));
    if(route==="/consultations"){
     const skip=p.getByRole("button",{name:"Пропустить"});
     if(await skip.count() && await skip.first().isVisible()) await skip.first().click({timeout:5000});
     const next=p.getByRole("navigation",{name:"Раздел консультаций"}).getByRole("link",{name:"Мои консультации"});
     if(await next.count()&&await next.isVisible()){
      if(role==="ADMIN"){
       const probe=await next.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {rect:{x:r.x,y:r.y,w:r.width,h:r.height},hit:{tag:hit?.tagName,className:String(hit?.className).slice(0,110),text:hit?.textContent?.slice(0,100)},self:hit===el}});
       console.log("ADMIN_CONSULT_CLICK_HIT",JSON.stringify(probe));
       await p.screenshot({path:".local-pg-scratch/qa-logs/browser-20261029/admin-consult-click-blocked.png"});
      }
      await next.click({timeout:5000});await p.waitForURL("**/consultations/my",{timeout:7500});
      console.log("CONSULTATION_NAV_CLICK_PASS",role,width);
     }
    }
   }
  }finally{await ctx.close()}
 }
 }finally{await b.close()}
})().catch(e=>{console.log("COMMERCIAL_SCREEN_ERROR",String(e.message).slice(0,180));process.exitCode=1}).finally(()=>{
 fs.writeFileSync(".local-pg-scratch/qa-logs/browser-20261029/commercial-screens.json",JSON.stringify(results,null,2));
});
