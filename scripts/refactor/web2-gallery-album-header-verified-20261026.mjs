/** Isolated, read-only lazy chunk diagnostic; no baseline updates or prod. */
import { chromium } from "../../.local-browser-mcp/node_modules/playwright/index.mjs";
import { realpathSync,existsSync,mkdirSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { connect } from "node:net";
const root="/Users/asmtv1/Desktop/gafus-refactor";
const port=5283;
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
const output=join(root,".design-verify/web2-gallery-album-header-verified-20261026");
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
    if(req.method()!=="GET"){requests.push("blocked-write:"+req.method()+" "+u.pathname);return route.abort();}
    const album={id:"album_01",ownerId:"visual-user",ownerUsername:"visual_user",
      name:"патри",description:"делает гаф",isVisible:true,
      canEdit:true,photoCount:3,coverThumbUrl:null,urlsExpireAt:"2099-10-17T00:00:00.000Z",coverPhotoId:null};
    const ownPage={items:[album],nextCursor:null,isOwner:true,enabled:true,usedSlots:1,limit:200};
    const photo={id:"photo_01",albumId:"album_01",caption:"Мяч на прогулке",
      status:"ready",width:1,height:1,thumbUrl:"https://web2-local-image.invalid/thumb.png?sig=WEB2_NONPROD",
      fullUrl:"https://web2-local-image.invalid/full.png?sig=WEB2_NONPROD",
      urlsExpireAt:"2099-10-17T00:00:00.000Z"};
    const photos={items:[photo],nextCursor:null,isOwner:true,enabled:true,usedSlots:1,limit:200};
    const data=u.pathname==="/api/v1/auth/me"?{id:"visual-user",username:"visual_user",role:"USER"}:
      u.pathname==="/api/v1/user/profile"?{id:"visual-user",username:"visual_user",
        profile:{fullName:"WEB2 Синтетический владелец",city:"Самара",about:"Альбомы"}}:
      u.pathname==="/api/v1/user/onboarding-tour"?{completed:true,currentStep:0}:
      u.pathname==="/api/v1/gallery/profiles/visual_user/albums"&&u.search==="?pageSize=20"?ownPage:
      u.pathname==="/api/v1/gallery/albums/album_01"?album:
      u.pathname==="/api/v1/gallery/albums/album_01/photos"&&u.search==="?pageSize=20"?photos:
      u.pathname==="/api/v1/pets"?[]:null;
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
    await page.goto(`http://127.0.0.1:${port}/profile/albums`,{waitUntil:"domcontentloaded"});
    try{await page.locator('a[href="/profile/albums/album_01"]').waitFor({state:"visible",timeout:9000});}
    catch(error){
      console.log("WEB2_GALLERY_DIAGNOSTIC_BODY",(await page.locator('body').innerText()).slice(0,1300));
      console.log("WEB2_GALLERY_DIAGNOSTIC_UNEXPECTED",JSON.stringify(requests));
      console.log("WEB2_GALLERY_DIAGNOSTIC_ERRORS",JSON.stringify(errors));
      await page.screenshot({path:output+"/diagnostic-"+v.name+".png",fullPage:true});
      throw error;
    }
    await page.evaluate(()=>document.fonts.ready);
    const list=await page.evaluate(()=>{
      const scope=document.querySelector('[data-next-gallery]');
      const bounds=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};};
      return {scope:bounds(scope),heading:scope?.querySelector('h1')?.textContent,
        linkCount:scope?.querySelectorAll('a[href="/profile/albums/album_01"]').length,
        scrollWidth:document.documentElement.scrollWidth};
    });
    await page.screenshot({path:output+"/gallery-list-"+v.name+"-vite.png",fullPage:true,animations:"disabled"});
    if(list.heading!=="Фотоальбомы"||list.linkCount!==1||list.scrollWidth>v.width)
      throw Error("WEB2_GALLERY_LIST_LOADED_FAILED_"+v.name);
    const create=page.getByRole('button',{name:/Создать альбом/});
    await create.click();
    await page.locator('form.gallery-editor').waitFor({state:"visible",timeout:5000});
    if(await page.locator('a[href="/profile/albums/album_01"]').count())
      throw Error("WEB2_CREATE_SOURCE_GRID_NOT_HIDDEN_"+v.name);
    const createFields=await page.locator('form.gallery-editor').evaluate(form=>({
      headings:[...form.querySelectorAll('h3')].map(el=>el.textContent),
      listHeading:document.querySelector('.gallery-header h1')?.textContent,
      sourceHint:document.querySelector('[class*="albumCreationHint"]')?.textContent?.trim(),
      visibilityText:form.textContent?.includes('Виден всем авторизованным'),
      inputs:form.querySelectorAll('input').length,
      textarea:form.querySelectorAll('textarea').length,
      hasCancel:[...form.querySelectorAll('button')].some(x=>x.textContent?.trim()==="Отмена"),
    }));
    await page.screenshot({path:output+"/gallery-create-form-"+v.name+"-vite.png",fullPage:true,animations:"disabled"});
    if(createFields.headings.length!==0||createFields.listHeading!=="Новый альбом"||
      !createFields.sourceHint?.includes("Придумайте название")||
      !createFields.visibilityText||createFields.inputs<2||
      createFields.textarea!==1||!createFields.hasCancel)
      throw Error("WEB2_GALLERY_CREATE_FORM_NOT_LOADED_"+v.name);
    await page.locator('form.gallery-editor').getByRole('button',{name:'Отмена'}).click();
    await page.locator('form.gallery-editor').waitFor({state:'detached',timeout:5000});
    await page.locator('a[href="/profile/albums/album_01"]').click();
    const title=page.getByRole('heading',{name:'патри',exact:true});
    await title.waitFor({state:"visible",timeout:15000});
    await page.getByRole('button',{name:'Открыть фотографию Мяч на прогулке'})
      .waitFor({state:"visible",timeout:15000});
    const detail=await page.evaluate(()=>{
      const el=document.querySelector('.gallery-album-detail');
      const h=el?.querySelector('h1'),rect=h?.getBoundingClientRect();
      return {albumH1Count:el?.querySelectorAll('h1').length,
        albumTitle:h?.textContent,titleSize:h?getComputedStyle(h).fontSize:null,
        albumTitleBounds:rect?{x:Math.round(rect.x),width:Math.round(rect.width)}:null,
        globalListHeader:document.querySelectorAll('.gallery-header').length,
        photoSection:el?.querySelector('h2')?.textContent,
        back:el?.querySelector('button')?.textContent?.trim(),
        albumDescription:el?.querySelector('[aria-label="Описание альбома"]')?.textContent?.trim(),
        factLabels:[...el?.querySelectorAll('dl[aria-label="Информация об альбоме"] dt')??[]]
          .map(node=>node.textContent?.trim()),
        factValues:[...el?.querySelectorAll('dl[aria-label="Информация об альбоме"] dd')??[]]
          .map(node=>node.textContent?.trim()),
        factHelp:el?.querySelector('dl[aria-label="Информация об альбоме"] small')?.textContent?.trim(),
        structure:(()=>{const title=el?.querySelector('h1');const about=el?.querySelector('[aria-label="Описание альбома"]');
          const facts=el?.querySelector('dl[aria-label="Информация об альбоме"]');
          const box=node=>{if(!node)return null;let b=node.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom}};
          return {title:box(title),about:box(about),facts:box(facts)};})(),
        scrollWidth:document.documentElement.scrollWidth};
    });
    if(detail.albumDescription!=='Об альбомеделает гаф'||
      detail.factLabels.join('|')!=='Фотографии|Кто видит альбом'||
      detail.factValues.join('|')!=='3 фото|Пользователи GAFUS'||
      detail.factHelp!=='Доступен после входа в аккаунт'||
      detail.structure.title.bottom>detail.structure.about.y||
      detail.structure.about.bottom>detail.structure.facts.y||
      detail.structure.facts.width>detail.structure.title.width+200||
      (v.name==="mobile"&&detail.structure.about.width<280))
      throw Error('HEADER_STRUCTURE_INVALID_'+v.name+'_'+JSON.stringify(detail));
    await page.screenshot({path:output+"/gallery-detail-"+v.name+"-vite.png",fullPage:true,animations:"disabled"});
    records.push({viewport:v.name,width:v.width,height:v.height,list,createFields,detail});
    console.log("WEB2_GALLERY_VITE_LOADED",JSON.stringify(records.at(-1)));
    if(detail.albumH1Count!==1||detail.albumTitle!=="патри"||
      detail.globalListHeader!==0||detail.photoSection!=="Фотографии"||
      detail.back!=="Все альбомы"||detail.scrollWidth>v.width||
      parseFloat(detail.titleSize)<24||parseFloat(detail.titleSize)>38||requests.length)
      throw Error("WEB2_GALLERY_DETAIL_INVALID_"+v.name);
  }
  writeFileSync(output+"/geometry.json",JSON.stringify({records,errors,requests},null,2));
  console.log("WEB2_GALLERY_VITE_ERRORS",JSON.stringify(errors.slice(0,12)));
  console.log("WEB2_GALLERY_VITE_UNKNOWN_API",JSON.stringify(requests.slice(0,12)));
  if(errors.length||requests.length)throw Error("WEB2_GALLERY_VITE_JS_OR_NETWORK_ERRORS");
  await ctx.close();
}finally{await browser?.close();server.kill("SIGTERM");await Promise.race([new Promise(resolve=>server.on("exit",resolve)),delay(1500)]);}
