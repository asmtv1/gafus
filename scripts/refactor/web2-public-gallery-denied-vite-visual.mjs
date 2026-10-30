/** Isolated, read-only lazy chunk diagnostic; no baseline updates or prod. */
import { chromium } from "../../.local-browser-mcp/node_modules/playwright/index.mjs";
import { realpathSync,existsSync,mkdirSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { connect } from "node:net";
const root="/Users/asmtv1/Desktop/gafus-refactor";
const port=5262;
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
const output=join(root,".design-verify/web2-public-gallery-denied-20261026");
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
    if(u.hostname==="web2-local-image.invalid" &&
        ["/thumb.png","/full.png"].includes(u.pathname) && u.search==="?sig=WEB2_NONPROD")
      return route.fulfill({status:200,contentType:"image/png",
        body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==","base64")});
    if(u.hostname!=="127.0.0.1"||u.port!==String(port))return route.abort();
    if(!u.pathname.startsWith("/api/v1/"))return route.continue();
    if(u.pathname==='/api/v1/gallery/albums/album_public')return route.fulfill({
      status:404,contentType:'application/json',
      body:JSON.stringify({success:false,error:'PRIVATE_STORAGE_BUCKET_PATH'})
    });
    const album={id:'album_public',ownerId:'visual_foreign',ownerUsername:'friend',
      name:'Открытый парк',description:'Публичные прогулки собаки',isVisible:true,
      canEdit:false,photoCount:1,coverThumbUrl:null,urlsExpireAt:'2099-10-17T00:00:00.000Z',
      coverPhotoId:null};
    const photo={id:'photo_public',albumId:'album_public',caption:'Мяч в парке',
      status:'ready',width:1,height:1,
      thumbUrl:'https://web2-local-image.invalid/thumb.png?sig=WEB2_NONPROD',
      fullUrl:'https://web2-local-image.invalid/full.png?sig=WEB2_NONPROD',
      urlsExpireAt:'2099-10-17T00:00:00.000Z'};
    const publicPage={items:[album],nextCursor:null,isOwner:false,enabled:true,usedSlots:0,limit:200};
    const photos={items:[photo],nextCursor:null,isOwner:false,enabled:true,usedSlots:0,limit:200};
    const data=u.pathname==='/api/v1/auth/me'?{id:'visual-user',username:'visual_user',role:'USER'}:
      u.pathname==='/api/v1/user/profile'?{id:'visual-user',username:'visual_user',
        profile:{fullName:'WEB2 Синтетический зритель',city:'Самара',about:'Публичное'}}:
      u.pathname==='/api/v1/user/onboarding-tour'?{completed:true,currentStep:0}:
      u.pathname==='/api/v1/gallery/profiles/friend/albums'&&u.search==='?pageSize=20'?publicPage:
      u.pathname==='/api/v1/gallery/albums/album_public'?album:
      u.pathname==='/api/v1/gallery/albums/album_public/photos'&&u.search==='?pageSize=20'?photos:
      u.pathname==='/api/v1/pets'?[]:null;
    if(data===null){requests.push("unexpected:"+u.pathname);return route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({success:false,error:"NO_FIXTURE"})})}
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({success:true,data})});
  });
  const page=await ctx.newPage();
  page.on("pageerror",error=>errors.push("page:"+error.message.slice(0,450)));
  // Expected native browser console resource 404 is recorded separately;
  // the strict JS pageerror and unexpected endpoint checks stay enforced.
  const expectedResourceErrors=[];
  page.on("console",msg=>{if(msg.type()==="error")
    expectedResourceErrors.push(msg.text().slice(0,450));});
  page.on("requestfailed",request=>{if(request.url().startsWith(`http://127.0.0.1:${port}/`))errors.push("failed:"+new URL(request.url()).pathname)});
  page.on("response",r=>{if(r.status()>=400&&r.url().startsWith(`http://127.0.0.1:${port}/`)&&
    !(r.status()===404&&new URL(r.url()).pathname==='/api/v1/gallery/albums/album_public'))
    errors.push("status:"+r.status()+" "+new URL(r.url()).pathname)});
  const records=[];
  for(const v of [{name:'desktop',width:1280,height:800},{name:'mobile',width:390,height:844}]){
    await page.setViewportSize({width:v.width,height:v.height});
    await page.goto(`http://127.0.0.1:${port}/profile/albums/album_public?username=friend`,
      {waitUntil:'domcontentloaded'});
    const title=page.getByRole('heading',{name:'Альбом недоступен',exact:true});
    await title.waitFor({state:'visible',timeout:16000});
    await page.evaluate(()=>document.fonts.ready);
    const failure=await page.evaluate(()=>({
      heading:document.querySelector('.gallery-public-albums h1')?.textContent,
      count:document.querySelectorAll('.gallery-public-albums h1').length,
      retry:!![...document.querySelectorAll('.gallery-public-albums button')]
        .find(x=>x.textContent?.trim()==='Повторить'),
      profile:!!document.querySelector('.gallery-public-albums a[href="/profile"]'),
      denied:document.body.innerText.includes('Открытые альбомы этого пользователя недоступны'),
      secret:document.body.innerText.includes('PRIVATE_STORAGE_BUCKET_PATH'),
      photos:document.querySelectorAll('.gallery-photo-grid img').length,
      scrollWidth:document.documentElement.scrollWidth,
    }));
    if(failure.heading!=='Альбом недоступен'||failure.count!==1||!failure.retry||
      !failure.profile||!failure.denied||failure.secret||failure.photos||
      failure.scrollWidth>v.width)
      throw Error('WEB2_GALLERY_DENIAL_UI_INVALID_'+v.name+':'+JSON.stringify(failure));
    await page.screenshot({path:output+'/gallery-denied-'+v.name+'-vite.png',fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Повторить',exact:true}).click();
    await page.getByRole('heading',{name:'Альбом недоступен',exact:true})
      .waitFor({state:'visible',timeout:8000});
    const illegalPhotoGets=requests.filter(p=>String(p).includes('/photos'));
    if(illegalPhotoGets.length)throw Error('WEB2_DENIED_GALLERY_PHOTO_FETCH_'+v.name);
    records.push({viewport:v.name,width:v.width,height:v.height,failure,retry:true});
    console.log('WEB2_DENIED_PUBLIC_GALLERY_LOADED',JSON.stringify(records.at(-1)));
  }
  writeFileSync(output+'/geometry.json',JSON.stringify({records,errors,requests,
    expectedResourceErrors},null,2));
  if(errors.length||requests.length)
    throw Error('WEB2_DENIED_GALLERY_UNEXPECTED_'+JSON.stringify({errors,requests}));
  await ctx.close();
}finally{await browser?.close();server.kill("SIGTERM");await Promise.race([new Promise(resolve=>server.on("exit",resolve)),delay(1500)]);}
