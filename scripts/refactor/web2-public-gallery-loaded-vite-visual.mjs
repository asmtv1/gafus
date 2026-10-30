/** Isolated, read-only lazy chunk diagnostic; no baseline updates or prod. */
import { chromium } from "../../.local-browser-mcp/node_modules/playwright/index.mjs";
import { realpathSync,existsSync,mkdirSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { connect } from "node:net";
const root="/Users/asmtv1/Desktop/gafus-refactor";
const port=5259;
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
const output=join(root,".design-verify/web2-public-gallery-loaded-round2-20261026");
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
  page.on("console",msg=>{if(msg.type()==="error")errors.push("console:"+msg.text().slice(0,450))});
  page.on("requestfailed",request=>{if(request.url().startsWith(`http://127.0.0.1:${port}/`))errors.push("failed:"+new URL(request.url()).pathname)});
  page.on("response",r=>{if(r.status()>=400&&r.url().startsWith(`http://127.0.0.1:${port}/`))errors.push("status:"+r.status()+" "+new URL(r.url()).pathname)});
  const records=[];
  for(const v of [{name:'desktop',width:1280,height:800},{name:'mobile',width:390,height:844}]){
    await page.setViewportSize({width:v.width,height:v.height});
    await page.goto(`http://127.0.0.1:${port}/profile/albums?username=friend`,{waitUntil:'domcontentloaded'});
    await page.getByText('Открытый парк',{exact:true}).waitFor({state:'visible',timeout:16000});
    await page.evaluate(()=>document.fonts.ready);
    const listing=await page.evaluate(()=>({
      heading:document.querySelector('.gallery-public-albums h1')?.textContent,
      cardCount:document.querySelectorAll('.gallery-public-albums .gallery-album-card').length,
      ownerActions:document.body.innerText.includes('Создать альбом'),
      scrollWidth:document.documentElement.scrollWidth,
    }));
    if(listing.heading!=='Фотоальбомы @friend'||listing.cardCount!==1||
      listing.ownerActions||listing.scrollWidth>v.width)
      throw Error('WEB2_PUBLIC_GALLERY_LIST_INVALID_'+v.name+':'+JSON.stringify(listing));
    await page.screenshot({path:output+'/public-gallery-list-'+v.name+'-vite.png',fullPage:true,animations:'disabled'});
    await page.goto(`http://127.0.0.1:${port}/profile/albums/album_public?username=friend`,
      {waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'Открытый парк',exact:true})
      .waitFor({state:'visible',timeout:16000});
    await page.getByRole('button',{name:'Открыть фотографию Мяч в парке'})
      .waitFor({state:'visible',timeout:16000});
    await page.evaluate(()=>document.fonts.ready);
    const detail=await page.evaluate(()=>{
      const root=document.querySelector('.gallery-public-albums');
      const h=root?.querySelector('h1'); const r=root?.getBoundingClientRect();
      return {heading:h?.textContent,headings:root?.querySelectorAll('h1').length,
        font:h?getComputedStyle(h).fontSize:null,
        width:Math.round(r?.width??0),photoSection:root?.querySelector('h2')?.textContent,
        description:root?.textContent?.includes('Публичные прогулки собаки'),
        meta:root?.textContent?.includes('1 фото'),
        link:!!root?.querySelector('a[href="/profile/albums?username=friend"]'),
        ownerActions:['Создать альбом','Редактировать альбом','Удалить альбом']
          .some(t=>root?.textContent?.includes(t)),
        scrollWidth:document.documentElement.scrollWidth};
    });
    if(detail.heading!=='Открытый парк'||detail.headings!==1||detail.description!==true||
      detail.meta!==true||detail.photoSection!=='Фотографии'||!detail.link||
      detail.ownerActions||detail.scrollWidth>v.width||
      detail.font!==(v.name==='desktop'?'38px':'28px'))
      throw Error('WEB2_PUBLIC_GALLERY_DETAIL_INVALID_'+v.name+':'+JSON.stringify(detail));
    await page.screenshot({path:output+'/public-gallery-detail-'+v.name+'-vite.png',fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Открыть фотографию Мяч в парке'}).click();
    const dialog=page.getByRole('dialog',{name:'Просмотр фотографии'});
    await dialog.waitFor({state:'visible',timeout:5000});
    const focusOpen=await page.evaluate(()=>document.activeElement?.textContent?.trim());
    if(focusOpen!=='Закрыть фотографию')
      throw Error('WEB2_PUBLIC_VIEWER_INITIAL_FOCUS_INVALID_'+v.name);
    await page.keyboard.press('Tab');
    const focusTab=await page.evaluate(()=>document.activeElement?.textContent?.trim());
    if(focusTab!=='Закрыть фотографию')
      throw Error('WEB2_PUBLIC_VIEWER_TAB_ESCAPE_INVALID_'+v.name);
    await page.screenshot({path:output+'/public-gallery-modal-'+v.name+'-vite.png',fullPage:true,animations:'disabled'});
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'detached',timeout:5000});
    const restored=await page.evaluate(()=>document.activeElement?.getAttribute('aria-label'));
    if(restored!=='Открыть фотографию Мяч в парке')
      throw Error('WEB2_PUBLIC_VIEWER_FOCUS_NOT_RESTORED_'+v.name);
    records.push({viewport:v.name,width:v.width,height:v.height,listing,detail,
      modalClosed:true,focusOpen,focusTab,restored});
    console.log('WEB2_PUBLIC_GALLERY_VITE_LOADED',JSON.stringify(records.at(-1)));
  }
  writeFileSync(output+'/geometry.json',JSON.stringify({records,errors,requests},null,2));
  if(errors.length||requests.length)
    throw Error('WEB2_PUBLIC_GALLERY_BROWSER_ERRORS_'+JSON.stringify({errors,requests}));
  await ctx.close();
}finally{await browser?.close();server.kill("SIGTERM");await Promise.race([new Promise(resolve=>server.on("exit",resolve)),delay(1500)]);}
