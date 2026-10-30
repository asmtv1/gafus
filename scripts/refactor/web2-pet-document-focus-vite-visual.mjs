/** Isolated, read-only lazy chunk diagnostic; no baseline updates or prod. */
import { chromium } from "../../.local-browser-mcp/node_modules/playwright/index.mjs";
import { realpathSync,existsSync,mkdirSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { connect } from "node:net";
const root="/Users/asmtv1/Desktop/gafus-refactor";
const port=5260;
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
const output=join(root,".design-verify/web2-pet-document-focus-round7-20261026");
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
    if(u.hostname==="web2-local-doc.invalid"&&
        u.pathname==="/preview.png"&&u.search==="?sig=WEB2")
      return route.fulfill({status:200,contentType:"image/png",
        body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==","base64")});
    if(u.hostname!=="127.0.0.1"||u.port!==String(port))return route.abort();
    if(!u.pathname.startsWith("/api/v1/"))return route.continue();
    const dog={id:"pet_A",name:"Рекс",type:"DOG",breed:"Метис",showInProfile:true,
      birthDate:"2020-06-15T00:00:00.000Z",weightKg:17.3,heightCm:54,
      _count:{preventionEntries:2,documents:3}};
    const cat={id:"pet_B",name:"Мурка",type:"CAT",breed:"Дворовая",showInProfile:false,
      birthDate:null,weightKg:null,heightCm:null,
      _count:{preventionEntries:0,documents:0}};
    const data=u.pathname==="/api/v1/auth/me"?{id:"visual-user",username:"visual_user",role:"USER"}:
      u.pathname==="/api/v1/pets"?[dog,cat]:
      u.pathname==="/api/v1/pets/pet_A"?{...dog,notes:"PRIVATE_PET_OWNER_ONLY",
        neckGirthCm:38,muzzleGirthCm:22,bellyGirthCm:49}:
      u.pathname==="/api/v1/pets/pet_B"?{...cat,notes:"PRIVATE_CAT_OWNER_ONLY",
        neckGirthCm:null,muzzleGirthCm:null,bellyGirthCm:null}:
      u.pathname==="/api/v1/pets/pet_A/documents"?[{
        id:"doc_visual",petId:"pet_A",ownerId:"visual-user",name:"Ветпаспорт.png",
        mimeType:"image/png",sizeBytes:80,createdAt:"2026-10-10T10:00:00.000Z"}]:
      u.pathname==="/api/v1/pets/pet_A/documents/doc_visual/download"?{
        documentId:"doc_visual",downloadUrl:"https://web2-local-doc.invalid/preview.png?sig=WEB2"}:
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
  const privateGets=[];
  page.on("request",req=>{
    const u=new URL(req.url());
    if(u.pathname==="/api/v1/pets/pet_A"||u.pathname==="/api/v1/pets/pet_B")
      privateGets.push({path:u.pathname,method:req.method()});
  });
  for(const v of [{name:"desktop",width:1280,height:800},{name:"mobile",width:390,height:844}]){
    await page.setViewportSize({width:v.width,height:v.height});
    const privateGetStart=privateGets.length;
    await page.goto(`http://127.0.0.1:${port}/pets`,{waitUntil:"domcontentloaded"});
    await page.getByRole('button',{name:'Развернуть карточку питомца Рекс'}).waitFor({state:'visible',timeout:15000});
    await page.getByRole('button',{name:'Развернуть карточку питомца Мурка'}).waitFor({state:'visible',timeout:15000});
    await page.evaluate(()=>document.fonts.ready);
    const initial=await page.evaluate(()=>({body:document.body.innerText.slice(0,1100),
      gridWidth:document.querySelector('.pet-collection-grid')?.getBoundingClientRect().width,
      cards:document.querySelectorAll('.pet-collection-card').length,
      scrollWidth:document.documentElement.scrollWidth,
      privateVisible:document.body.innerText.includes('PRIVATE_PET_OWNER_ONLY')}));
    if(initial.cards!==2||initial.privateVisible||initial.scrollWidth>v.width||
      privateGets.length!==privateGetStart)throw Error('WEB2_PET_INITIAL_PRIVATE_FETCH_INVALID_'+v.name);
    await page.screenshot({path:output+"/pet-list-"+v.name+"-vite.png",fullPage:true,animations:"disabled"});
    await page.getByRole('button',{name:'Развернуть карточку питомца Рекс'}).click();
    await page.getByText('Заметки: PRIVATE_PET_OWNER_ONLY').waitFor({state:'visible',timeout:5000});
    const first=await page.evaluate(()=>({
      a:document.querySelector('#pet-card-details-pet_A')?.getAttribute('hidden')===null,
      b:document.querySelector('#pet-card-details-pet_B')?.getAttribute('hidden')===null,
      note:document.body.innerText.includes('Обхват шеи: 38 см'),
      listPrivate:document.querySelector('.petCompactFoot')?.textContent?.includes('PRIVATE_PET_OWNER_ONLY'),
    }));
    if(!first.a||first.b||!first.note||first.listPrivate)
      throw Error('WEB2_PET_FIRST_DETAIL_INVALID_'+v.name);
    await page.screenshot({path:output+"/pet-expanded-one-"+v.name+"-vite.png",fullPage:true,animations:"disabled"});
    await page.getByRole('button',{name:'Документы питомца'}).click();
    await page.getByText('Ветпаспорт.png').waitFor({state:'visible',timeout:5000});
    await page.getByRole('button',{name:'Открыть или скачать'}).click();
    const docDialog=page.getByRole('dialog',{name:'Просмотр документа Ветпаспорт.png'});
    await docDialog.waitFor({state:'visible',timeout:5000});
    const initialFocus=await page.evaluate(()=>document.activeElement?.textContent?.trim());
    if(initialFocus!=="Закрыть просмотр")throw Error('WEB2_DOC_FOCUS_INITIAL_'+v.name+':'+initialFocus);
    await page.keyboard.press('Tab');
    const nextFocus=await page.evaluate(()=>document.activeElement?.textContent?.trim());
    if(nextFocus!=="Поделиться")throw Error('WEB2_DOC_FOCUS_TAB_'+v.name+':'+nextFocus);
    await page.keyboard.press('Shift+Tab');
    const prevFocus=await page.evaluate(()=>document.activeElement?.textContent?.trim());
    if(prevFocus!=="Закрыть просмотр")throw Error('WEB2_DOC_FOCUS_REVERSE_'+v.name+':'+prevFocus);
    const preview=await docDialog.evaluate(el=>{
      const box=el.getBoundingClientRect();return {
        x:Math.round(box.x),y:Math.round(box.y),width:Math.round(box.width),
        image:!!el.querySelector('img[alt="Ветпаспорт.png"]'),
        visibleAreaWidth:Math.round(Math.min(window.innerWidth,box.right)-Math.max(0,box.left)),
      };
    });
    await page.screenshot({path:output+"/pet-document-modal-"+v.name+"-vite.png",fullPage:true,animations:"disabled"});
    await docDialog.getByRole('button',{name:'Поделиться'}).click();
    const share=await docDialog.evaluate(el=>({
      panel:!!el.querySelector('[aria-label="Поделиться ссылкой"]'),
      input:el.querySelector('input[aria-label="Ссылка на документ"]')?.value,
      readonly:el.querySelector('input[aria-label="Ссылка на документ"]')?.readOnly,
      copy:!![...el.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Скопировать'),
      width:Math.round(el.getBoundingClientRect().width),
      scrollWidth:document.documentElement.scrollWidth,
    }));
    if(!share.panel||!share.readonly||!share.copy||
      share.input!=="https://web2-local-doc.invalid/preview.png?sig=WEB2"||
      share.scrollWidth>v.width)throw Error('WEB2_DOCUMENT_SHARE_SOURCE_INVALID_'+v.name);
    await page.screenshot({path:output+"/pet-document-share-"+v.name+"-vite.png",fullPage:true,animations:"disabled"});
    await docDialog.getByRole('button',{name:'Поделиться'}).click();
    if(await docDialog.locator('[aria-label="Поделиться ссылкой"]').count())
      throw Error('WEB2_DOCUMENT_SHARE_CLOSE_FAILED_'+v.name);
    if(!preview.image||preview.width<v.width*.7||preview.visibleAreaWidth<v.width*.7)
      throw Error('WEB2_DOCUMENT_MODAL_CLIPPED_'+v.name+':'+JSON.stringify(preview));
    await page.keyboard.press('Escape');
    await docDialog.waitFor({state:'detached',timeout:5000});
    const restored=await page.evaluate(()=>document.activeElement?.textContent?.trim());
    if(restored!=="Открыть или скачать")throw Error('WEB2_DOC_FOCUS_RESTORE_'+v.name+':'+restored);
    await page.getByRole('button',{name:'Скрыть документы'}).click();
    await page.getByRole('button',{name:'Изменить данные',exact:true}).click();
    await page.locator('section[aria-label="Редактирование питомца"] form')
      .waitFor({state:'visible',timeout:5000});
    const edit=await page.evaluate(()=>({
      note:document.querySelector('section[aria-label="Редактирование питомца"] textarea')?.value,
      name:document.querySelector('section[aria-label="Редактирование питомца"] input')?.value,
      htmlForms:document.querySelectorAll('section[aria-label="Редактирование питомца"] form').length,
    }));
    if(edit.note!=="PRIVATE_PET_OWNER_ONLY"||edit.name!=="Рекс"||edit.htmlForms!==1)
      throw Error('WEB2_PET_INLINE_SOURCE_EDIT_INVALID_'+v.name);
    await page.screenshot({path:output+"/pet-inline-edit-"+v.name+"-vite.png",fullPage:true,animations:"disabled"});
    await page.getByRole('button',{name:'Закрыть редактирование'}).click();
    await page.locator('section[aria-label="Редактирование питомца"] form')
      .waitFor({state:'detached',timeout:5000});
    await page.getByRole('button',{name:'Развернуть карточку питомца Мурка'}).click();
    await page.getByText('Заметки: PRIVATE_CAT_OWNER_ONLY').waitFor({state:'visible',timeout:5000});
    const both=await page.evaluate(()=>({
      a:document.querySelector('#pet-card-details-pet_A')?.getAttribute('hidden')===null,
      b:document.querySelector('#pet-card-details-pet_B')?.getAttribute('hidden')===null,
      scrollWidth:document.documentElement.scrollWidth,
    }));
    if(!both.a||!both.b||both.scrollWidth>v.width)
      throw Error('WEB2_PET_BOTH_EXPANDED_INVALID_'+v.name);
    await page.screenshot({path:output+"/pet-expanded-both-"+v.name+"-vite.png",fullPage:true,animations:"disabled"});
    await page.getByRole('button',{name:'Свернуть карточку питомца Рекс'}).click();
    const closed=await page.evaluate(()=>({
      aHidden:document.querySelector('#pet-card-details-pet_A')?.hasAttribute('hidden'),
      bVisible:!document.querySelector('#pet-card-details-pet_B')?.hasAttribute('hidden'),
      oldPrivateVisible:document.body.innerText.includes('PRIVATE_PET_OWNER_ONLY'),
      catPrivateVisible:document.body.innerText.includes('PRIVATE_CAT_OWNER_ONLY'),
    }));
    if(!closed.aHidden||!closed.bVisible||closed.oldPrivateVisible||
      !closed.catPrivateVisible)throw Error('WEB2_PET_INDEPENDENT_COLLAPSE_INVALID_'+v.name);
    records.push({viewport:v.name,width:v.width,height:v.height,initial,first,preview,share,
      initialFocus,nextFocus,prevFocus,restored,edit,both,closed});
    console.log("WEB2_PET_VITE_LOADED",JSON.stringify(records.at(-1)));
  }
  writeFileSync(output+"/geometry.json",JSON.stringify({records,errors,requests,privateGets},null,2));
  console.log("WEB2_PET_ERRORS",JSON.stringify(errors.slice(0,12)));
  console.log("WEB2_PET_UNEXPECTED_HTTP",JSON.stringify(requests.slice(0,12)));
  if(errors.length||requests.length||privateGets.some(x=>x.method!=="GET"))
    throw Error("WEB2_PET_BROWSER_ERRORS_OR_BAD_HTTP");
  await ctx.close();
}finally{await browser?.close();server.kill("SIGTERM");await Promise.race([new Promise(resolve=>server.on("exit",resolve)),delay(1500)]);}
