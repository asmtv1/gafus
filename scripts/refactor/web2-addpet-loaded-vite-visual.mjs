/** Isolated, read-only lazy chunk diagnostic; no baseline updates or prod. */
import { chromium } from "../../.local-browser-mcp/node_modules/playwright/index.mjs";
import { realpathSync,existsSync,mkdirSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { connect } from "node:net";
const root="/Users/asmtv1/Desktop/gafus-refactor";
const port=5252;
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
const output=join(root,".design-verify/web2-addpet-vite-structure-round4-20261026");
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
      u.pathname==="/api/v1/user/onboarding-tour"?{completed:true,currentStep:0}:null;
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
    await page.goto(`http://127.0.0.1:${port}/profile/addPet`,{waitUntil:"domcontentloaded"});
    await page.locator("#g05-form-title").waitFor({state:"visible",timeout:12000});
    await page.locator('img[src="/images/pet-type-dog.webp"]').waitFor({state:"visible"});
    await page.evaluate(()=>document.fonts.ready);
    await delay(250);
    const geometry=await page.evaluate(()=>{
      const bounds=(el)=>{if(!el)return null;const r=el.getBoundingClientRect();const st=getComputedStyle(el);
        return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),background:st.backgroundColor};};
      const h1=document.querySelector("#g05-form-title");
      const main=h1?.closest("main"),form=main?.querySelector("form"),card=h1?.closest("section");
      const imgs=[...document.querySelectorAll('img[src^="/images/pet-type-"]')].map(el=>({url:el.getAttribute('src'),ok:el.complete&&el.naturalWidth>0}));
      return {main:bounds(main),card:bounds(card),h1:bounds(h1),form:bounds(form),
        h1Font:h1?getComputedStyle(h1).fontSize:null,
        cardPadding:card?getComputedStyle(card).padding:null,images:imgs,
        sectionTitles:[...document.querySelectorAll("main form p")].map(el=>el.textContent).filter(x=>/Основная информация|Физические характеристики|Дополнительно/.test(x)),
        bodyWidth:document.documentElement.scrollWidth,visible:!!h1};
    });
    await page.screenshot({path:output+"/addpet-"+v.name+"-vite.png",fullPage:true,animations:"disabled"});
    // An actual browser click exercises the original source validation state.
    // It must NOT send a pet POST while required fields are empty.
    await page.locator('main form button[type="submit"]').click();
    await page.locator('#g05-error').waitFor({state:"visible",timeout:3000});
    const validation=await page.evaluate(()=>({
      focused:document.activeElement?.id,
      invalid:document.querySelector('#g05-name')?.getAttribute('aria-invalid'),
      message:document.querySelector('#g05-error')?.textContent?.trim() ?? "",
    }));
    await page.screenshot({path:output+"/addpet-invalid-"+v.name+"-vite.png",
      fullPage:true,animations:"disabled"});
    records.push({viewport:v.name,width:v.width,height:v.height,geometry,validation});
    console.log("WEB2_ADDPET_VITE_LOADED",JSON.stringify(records.at(-1)));
    if(validation.focused!=="g05-name"||validation.invalid!=="true"||
      !validation.message||requests.length)throw Error("WEB2_ADDPET_VALIDATION_FAILED_"+v.name);
    if(!geometry.visible||geometry.images.length!==2||geometry.images.some(x=>!x.ok)||
      !geometry.card||geometry.main.width>520||geometry.bodyWidth>v.width||
      geometry.h1Font!=="24px"||geometry.sectionTitles.length!==3||
      !geometry.form||geometry.form.width<geometry.card.width-70)
      throw Error("WEB2_ADDPET_VITE_LAYOUT_INVALID_"+v.name);
  }
  writeFileSync(output+"/geometry.json",JSON.stringify({records,errors,requests},null,2));
  console.log("WEB2_ADDPET_VITE_ERRORS",JSON.stringify(errors.slice(0,12)));
  console.log("WEB2_ADDPET_VITE_UNKNOWN_API",JSON.stringify(requests.slice(0,12)));
  if(errors.length||requests.length)throw Error("WEB2_ADDPET_VITE_NETWORK_OR_JS_ERRORS");
  await ctx.close();
}finally{await browser?.close();server.kill("SIGTERM");await Promise.race([new Promise(resolve=>server.on("exit",resolve)),delay(1500)]);}
