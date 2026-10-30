/** Isolated, read-only lazy chunk diagnostic; no baseline updates or prod. */
import { chromium } from "../../.local-browser-mcp/node_modules/playwright/index.mjs";
import { realpathSync,existsSync,mkdirSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { connect } from "node:net";
const root="/Users/asmtv1/Desktop/gafus-refactor";
const port=5253;
if(realpathSync(process.cwd())!==root)throw Error("WRONG_ROOT");
const occupied=await new Promise(resolve=>{
  const s=connect({host:"127.0.0.1",port});
  s.on("connect",()=>{s.destroy();resolve(true)});
  s.on("error",e=>resolve(e?.code!=="ECONNREFUSED"));
  s.setTimeout(800,()=>{s.destroy();resolve(true)});
});
if(occupied)throw Error("WEB2_VISUAL_PORT_OCCUPIED");
const binary=join(root,".local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell");
if(!existsSync(binary)||!realpathSync(binary).startsWith(root+"/"))throw Error("CHROMIUM_DENIED");
const output=join(root,".design-verify/web2-vet-vite-structure-20261026");
if(existsSync(output))throw Error("WEB2_VISUAL_OUTPUT_ALREADY_EXISTS");
mkdirSync(output,{recursive:true});
const server=spawn("pnpm",["exec","vite","--config","vite.config.mjs","--host","127.0.0.1","--port",String(port),"--strictPort"],{
  cwd:join(root,"apps/web-vite"),env:{PATH:process.env.PATH,HOME:root+"/.local-pg-scratch",COREPACK_ENABLE_NETWORK:"0",GAFUS_VISUAL_PORT:String(port),GAFUS_WEB_DEV_API_MODE:"mock",VITE_API_BASE_URL:"http://127.0.0.1:4174"},stdio:"ignore",
});
let browser;
try{
  let ready=false;
  for(let i=0;i<60;i++){
    if(server.exitCode!==null)throw Error("VITE_EARLY_EXIT");
    try{const r=await fetch(`http://127.0.0.1:${port}/`);if(r.ok){ready=true;break}}catch{}
    await delay(200);
  }
  if(!ready)throw Error("VITE_NOT_READY");
  browser=await chromium.launch({headless:true,executablePath:binary,args:["--no-sandbox","--disable-gpu"]});
  const ctx=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:"block"});
  const errors=[];const requests=[];
  await ctx.route("**/*",async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.hostname!=="127.0.0.1"||u.port!==String(port))return route.abort();
    if(!u.pathname.startsWith("/api/v1/"))return route.continue();
    const data=u.pathname==="/api/v1/auth/me"?{id:"visual-user",username:"visual_user",role:"USER"}:
      u.pathname==="/api/v1/pets"?[{id:"dog-1",name:"Бим",type:"DOG",breed:"Метис",showInProfile:true}]:
      u.pathname==="/api/v1/user/onboarding-tour"?{completed:true,currentStep:0}:
      u.pathname==="/api/v1/pets/dog-1"?{
        id:"dog-1",name:"Бим",type:"DOG",breed:"Метис",showInProfile:true,
        birthDate:"2022-04-09T00:00:00.000Z",notes:null,photoUrl:null,
        weightKg:null,heightCm:null,neckGirthCm:null,muzzleGirthCm:null,bellyGirthCm:null,
      }:u.pathname==="/api/v1/pets/dog-1/vet-visits"?[]:null;
    if(data===null){requests.push("unexpected:"+u.pathname);return route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({success:false,error:"NO_FIXTURE"})})}
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({success:true,data})});
  });
  const page=await ctx.newPage();
  page.on("pageerror",error=>errors.push("page:"+error.message.slice(0,450)));
  page.on("console",msg=>{if(msg.type()==="error")errors.push("console:"+msg.text().slice(0,450))});
  page.on("requestfailed",request=>{if(request.url().startsWith(`http://127.0.0.1:${port}/`))errors.push("failed:"+new URL(request.url()).pathname)});
  page.on("response",r=>{if(r.status()>=400&&r.url().startsWith(`http://127.0.0.1:${port}/`))errors.push("status:"+r.status()+" "+new URL(r.url()).pathname)});
  const records=[];
  for(const v of [{name:"desktop",width:1280,height:800},{name:"mobile",width:390,height:844}]){
    await page.setViewportSize({width:v.width,height:v.height});
    await page.goto(`http://127.0.0.1:${port}/pets/dog-1/vet-visits`,{waitUntil:"domcontentloaded"});
    const heading=page.getByRole("heading",{name:"Посещения врача",exact:true});
    await heading.waitFor({state:"visible",timeout:12000});
    await page.getByRole("heading",{name:"Здесь будет история посещений"})
      .waitFor({state:"visible",timeout:9000});
    await page.evaluate(()=>document.fonts.ready);
    const geometry=await page.evaluate(()=>{
      const root=document.querySelector('main[aria-label="Посещения врача"]');
      const title=root?.querySelector("h1");const empty=root?.querySelector('section[aria-label="Нет посещений врача"]');
      const bounds=(el)=>{if(!el)return null;const r=el.getBoundingClientRect();
        return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};};
      return {page:bounds(root),title:bounds(title),empty:bounds(empty),
        font:title?getComputedStyle(title).fontSize:null,
        h1Count:root?.querySelectorAll("h1").length,
        back:[...root?.querySelectorAll('a[href="/pets"]')??[]].some(a=>a.textContent?.includes("К питомцам")),
        scrollWidth:document.documentElement.scrollWidth,
        emptyLabel:empty?.textContent?.trim().slice(0,180)};
    });
    await page.screenshot({path:output+"/vet-empty-"+v.name+"-vite.png",fullPage:true,animations:"disabled"});
    if(!geometry.page||geometry.page.width>780||geometry.h1Count!==1||!geometry.back||
      geometry.scrollWidth>v.width||!geometry.emptyLabel?.includes("Сохраните дату приёма"))
      throw Error("WEB2_VET_EMPTY_LAYOUT_INVALID_"+v.name);
    await page.getByRole('button',{name:'Добавить первую запись',exact:true}).click();
    await page.locator('form[aria-label="Форма посещения врача"]')
      .waitFor({state:"visible",timeout:5000});
    const formPresent=await page.getByRole('textbox',{name:'Специальность врача'}).count();
    await page.screenshot({path:output+"/vet-form-"+v.name+"-vite.png",fullPage:true,animations:"disabled"});
    records.push({viewport:v.name,width:v.width,height:v.height,geometry,formPresent});
    console.log("WEB2_VET_VITE_LOADED",JSON.stringify(records.at(-1)));
    if(!formPresent||requests.length)throw Error("WEB2_VET_FORM_INVALID_"+v.name);
  }
  writeFileSync(output+"/geometry.json",JSON.stringify({records,errors,requests},null,2));
  console.log("WEB2_VET_VITE_ERRORS",JSON.stringify(errors.slice(0,12)));
  console.log("WEB2_VET_VITE_UNKNOWN_API",JSON.stringify(requests.slice(0,12)));
  if(errors.length||requests.length)throw Error("WEB2_VET_VITE_NETWORK_OR_JS_ERRORS");
  await ctx.close();
}finally{await browser?.close();server.kill("SIGTERM");await Promise.race([new Promise(resolve=>server.on("exit",resolve)),delay(1500)]);}
