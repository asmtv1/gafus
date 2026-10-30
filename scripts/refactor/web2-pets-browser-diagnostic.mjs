/** Isolated, read-only lazy chunk diagnostic; no baseline updates or prod. */
import { chromium } from "../../.local-browser-mcp/node_modules/playwright/index.mjs";
import { realpathSync,existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { connect } from "node:net";
const root="/Users/asmtv1/Desktop/gafus-refactor";
const port=5197;
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
const server=spawn("pnpm",["exec","vite","--config","vite.config.mjs","--host","127.0.0.1","--port",String(port),"--strictPort"],{
  cwd:join(root,"apps/web-vite"),env:{...process.env,GAFUS_VISUAL_PORT:String(port)},stdio:"ignore",
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
  await page.goto(`http://127.0.0.1:${port}/pets`,{waitUntil:"domcontentloaded"});
  await delay(1800);
  console.log("WEB2_PETS_DIAGNOSTIC_BODY",(await page.locator("main").innerText()).slice(0,500));
  console.log("WEB2_PETS_DIAGNOSTIC_ERRORS",JSON.stringify(errors.slice(0,12)));
  console.log("WEB2_PETS_DIAGNOSTIC_REQUESTS",JSON.stringify(requests.slice(0,12)));
  await ctx.close();
}finally{await browser?.close();server.kill("SIGTERM");await Promise.race([new Promise(resolve=>server.on("exit",resolve)),delay(1500)]);}
