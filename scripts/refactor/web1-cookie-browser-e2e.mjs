/** WEB1 browser regression on isolated Vite only. No real users/production. */
import { spawn, execFileSync } from "node:child_process";
import { lstatSync, realpathSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { connect } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "../../.local-browser-mcp/node_modules/playwright/index.mjs";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const actualRoot = execFileSync("/usr/bin/git",["-C",ROOT,"rev-parse","--show-toplevel"],{encoding:"utf8"}).trim();
const branch = execFileSync("/usr/bin/git",["-C",ROOT,"branch","--show-current"],{encoding:"utf8"}).trim();
if(actualRoot!==ROOT || branch!=="vite" || process.cwd()!==ROOT)throw Error("WEB1_BROWSER_ROOT_DENIED");
for(const path of ["apps/web-vite","scripts/refactor",".local-browser-mcp/.cache"]) {
  if(lstatSync(join(ROOT,path)).isSymbolicLink() || !realpathSync(join(ROOT,path)).startsWith(ROOT+"/"))
    throw Error("WEB1_BROWSER_SYMLINK_DENIED");
}
const binary=join(ROOT,".local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell");
if(!existsSync(binary)||!realpathSync(binary).startsWith(ROOT+"/"))throw Error("WEB1_BROWSER_BINARY_DENIED");
const port=5189, base=`http://127.0.0.1:${port}`;
const occupied=()=>new Promise(resolve=>{
  const socket=connect({host:"127.0.0.1",port});
  const done=(value)=>{socket.destroy();resolve(value);};
  socket.setTimeout(1000,()=>done(true));socket.once("connect",()=>done(true));
  socket.once("error",e=>done(e?.code!=="ECONNREFUSED"));
});
if(await occupied())throw Error("WEB1_BROWSER_PORT_5189_BUSY");
const evidence=join(ROOT,".design-verify/web1-cookie-20261025");
if(!existsSync(evidence))mkdirSync(evidence,{recursive:true});
const server=spawn("/opt/homebrew/bin/node",[join(ROOT,"apps/web-vite/node_modules/vite/bin/vite.js"),"--config","vite.config.mjs", "--host","127.0.0.1","--port",String(port),"--strictPort"],{
  cwd:join(ROOT,"apps/web-vite"),
  env:{PATH:"/opt/homebrew/bin:/usr/bin:/bin",HOME:join(ROOT,".local-browser-mcp/.cache/home"),TMPDIR:join(ROOT,".local-browser-mcp/.cache/tmp"),COREPACK_ENABLE_NETWORK:"0",GAFUS_VISUAL_PORT:String(port)},
  stdio:["ignore","pipe","pipe"],
});
let serverLog="";
for(const stream of [server.stdout,server.stderr])stream.on("data",chunk=>{
  serverLog=(serverLog+String(chunk).slice(-600)).slice(-1500);
});
let browser;
let assertions=0;
const check=(assertion,message)=>{
  if(!assertion)throw Error("WEB1_BROWSER_ASSERTION_FAILED:"+message);
  assertions++;
};
try {
  let ready=false;
  for(let i=0;i<65;i++) {
    if(server.exitCode!==null)throw Error("WEB1_VITE_EXITED:"+serverLog);
    try {
      const response=await fetch(base+"/",{signal:AbortSignal.timeout(850)});
      if(response.ok){ready=true;break;}
    } catch { /* only loopback readiness */ }
    await sleep(150);
  }
  if(!ready)throw Error("WEB1_VITE_UNAVAILABLE:"+serverLog);
  browser=await chromium.launch({headless:true,executablePath:binary,
    args:["--no-sandbox","--disable-gpu","--disable-background-networking"],
    env:{PATH:"/opt/homebrew/bin:/usr/bin:/bin",HOME:join(ROOT,".local-browser-mcp/.cache/home"),XDG_CACHE_HOME:join(ROOT,".local-browser-mcp/.cache/tmp")}});
  for(const viewport of [{label:"desktop",width:1280,height:800},{label:"mobile",width:390,height:844}]) {
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1,locale:"ru-RU",serviceWorkers:"block",reducedMotion:"reduce"});
    const page=await context.newPage();
    const errors=[],methods=[];
    page.on("pageerror",e=>errors.push(String(e.message)));
    await context.route("**/*",async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.protocol!=="http:"||url.hostname!=="127.0.0.1"||url.port!==String(port))return route.abort();
      if(!url.pathname.startsWith("/api/v1/"))return route.continue();
      methods.push(`${req.method()} ${url.pathname}`);
      if(req.method()!=="GET")return route.fulfill({status:403,contentType:"application/json",body:JSON.stringify({success:false,error:"WEB1_READ_ONLY"})});
      const data=url.pathname==="/api/v1/auth/me"?{id:"web1-visual",username:"web1visual",role:"USER"}:
        url.pathname==="/api/v1/user/profile"?{id:"web1-visual",username:"web1visual",email:null,hasAppPassword:true,hasVkLinked:false,
          profile:{fullName:"Учебный профиль",city:"Самара",about:"Без production-данных",telegram:null,instagram:null,website:null,birthDate:null,avatarUrl:null}}:null;
      return route.fulfill({status:data===null?404:200,contentType:"application/json",body:JSON.stringify(data===null?
        {success:false,error:"WEB1_TEST_ENDPOINT_NOT_AVAILABLE"}:{success:true,data})});
    });
    await page.goto(base+"/profile?tab=settings",{waitUntil:"domcontentloaded",timeout:15000});
    await page.getByRole("button",{name:"Управление cookies"}).waitFor({timeout:10000});
    const dialog=page.getByRole("dialog",{name:"Использование cookies"});
    await dialog.waitFor();
    check(await dialog.isVisible(),viewport.label+":cookie dialog visible");
    check(await dialog.getByRole("button",{name:"Принять"}).isVisible(),viewport.label+":accept");
    check(await dialog.getByRole("button",{name:"Отклонить"}).isVisible(),viewport.label+":decline");
    const rect=await dialog.boundingBox();
    check(rect!==null&&rect.x===0&&Math.abs(rect.width-viewport.width)<=1,
      viewport.label+":full-width source banner");
    check(rect!==null&&Math.abs(rect.y+rect.height-viewport.height)<=1,
      viewport.label+":bottom aligned source banner");
    await dialog.screenshot({path:join(evidence,`cookie-first-${viewport.label}.png`)});
    await dialog.getByRole("button",{name:"Принять"}).click();
    await dialog.waitFor({state:"hidden"});
    check(await page.evaluate(()=>localStorage.getItem("gafus:cookieConsent:v1"))==="accepted",viewport.label+":accepted stored");
    await page.getByRole("button",{name:"Управление cookies"}).click();
    await dialog.waitFor();
    check(await page.evaluate(()=>localStorage.getItem("gafus:cookieConsent:v1"))===null,viewport.label+":reset storage");
    await dialog.getByRole("button",{name:"Отклонить"}).click();
    await dialog.waitFor({state:"hidden"});
    await page.reload({waitUntil:"domcontentloaded"});
    await page.getByRole("button",{name:"Управление cookies"}).waitFor();
    check(await page.evaluate(()=>localStorage.getItem("gafus:cookieConsent:v1"))==="declined",viewport.label+":decline survived reload");
    check(await page.getByRole("dialog",{name:"Использование cookies"}).count()===0,viewport.label+":closed after reload");
    check(await page.locator('[data-next-profile-settings]').count()===1,viewport.label+":real mounted settings");
    const layout=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth}));
    check(layout.scrollWidth<=layout.innerWidth,viewport.label+":no horizontal overflow");
    check(!methods.some(value=>value.startsWith("POST ")),viewport.label+":no write during read-only cookie test");
    check(errors.length===0,viewport.label+":no JS errors:"+errors.join(" | "));
    await context.close();
  }
  console.log(`WEB1_COOKIE_BROWSER_PASS assertions=${assertions} viewports=desktop1280x800,mobile390x844; fixture_only=true`);
} finally {
  await browser?.close();
  if(server.exitCode===null&&server.signalCode===null)server.kill("SIGTERM");
  await Promise.race([new Promise(done=>server.once("exit",done)),sleep(2000)]);
}
