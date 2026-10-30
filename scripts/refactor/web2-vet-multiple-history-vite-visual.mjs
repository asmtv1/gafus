/** Isolated, read-only lazy chunk diagnostic; no baseline updates or prod. */
import { chromium } from "../../.local-browser-mcp/node_modules/playwright/index.mjs";
import { realpathSync,existsSync,mkdirSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { connect } from "node:net";
const root="/Users/asmtv1/Desktop/gafus-refactor";
const port=5261;
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
const output=join(root,".design-verify/web2-vet-multiple-history-round5-20261026");
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
    if(u.pathname.endsWith('/media') &&
      u.search==='?variant=preview&redirect=1')return route.fulfill({
        status:200,contentType:'image/png',
        body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64')
      });
    if(!u.pathname.startsWith("/api/v1/"))return route.continue();
    const entry={id:'visit_visual',petId:'dog-1',visitedOn:'2026-10-10',
      specialty:'Терапевт',doctorName:'Синтетический врач',clinic:'Тестовая клиника',
      diagnosis:'PRIVATE_VISUAL_DIAGNOSIS',conclusion:'PRIVATE_VISUAL_CONCLUSION',
      notes:'PRIVATE_VISUAL_VET_NOTES',attachments:[{id:'visual_pdf',
        name:'Медкарта.pdf',mimeType:'application/pdf',sizeBytes:250,
        hasPreview:true,previewProcessing:false}]};
    const entryB={...entry,id:'visit_b',visitedOn:'2026-10-09',
      specialty:'Хирург',diagnosis:'PRIVATE_VISUAL_DIAGNOSIS_B',
      conclusion:'B_ONLY_UNIQUE_CONCLUSION',
      notes:'PRIVATE_VISUAL_MEDICAL_B',attachments:[]};
    const data=u.pathname==="/api/v1/auth/me"?{id:"visual-user",username:"visual_user",role:"USER"}:
      u.pathname==="/api/v1/pets"?[{id:"dog-1",name:"Бим",type:"DOG",breed:"Метис",showInProfile:true}]:
      u.pathname==="/api/v1/user/onboarding-tour"?{completed:true,currentStep:0}:
      u.pathname==="/api/v1/pets/dog-1"?{
        id:"dog-1",name:"Бим",type:"DOG",breed:"Метис",showInProfile:true,
        birthDate:"2022-04-09T00:00:00.000Z",notes:null,photoUrl:null,
        weightKg:null,heightCm:null,neckGirthCm:null,muzzleGirthCm:null,bellyGirthCm:null,
      }:u.pathname==="/api/v1/pets/dog-1/vet-visits"?[entry,entryB]:
      u.pathname==="/api/v1/pets/dog-1/vet-visits/visit_b"?entryB:
      u.pathname==="/api/v1/pets/dog-1/vet-visits/visit_visual"?entry:null;
    if(data===null){requests.push("unexpected:"+u.pathname);return route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({success:false,error:"NO_FIXTURE"})})}
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({success:true,data})});
  });
  const page=await ctx.newPage();
  page.on("pageerror",error=>errors.push("page:"+error.message.slice(0,450)));
  page.on("console",msg=>{if(msg.type()==="error")errors.push("console:"+msg.text().slice(0,450))});
  page.on("requestfailed",request=>{if(request.url().startsWith(`http://127.0.0.1:${port}/`))errors.push("failed:"+new URL(request.url()).pathname)});
  page.on("response",r=>{if(r.status()>=400&&r.url().startsWith(`http://127.0.0.1:${port}/`))errors.push("status:"+r.status()+" "+new URL(r.url()).pathname)});
  const records=[];
  const medicalReads=[];
  page.on('request',req=>{
    if(req.url().includes('/api/v1/pets/dog-1/vet-visits'))
      medicalReads.push({url:req.url(),method:req.method()});
  });
  for(const v of [{name:'desktop',width:1280,height:800},{name:'mobile',width:390,height:844}]){
    await page.setViewportSize({width:v.width,height:v.height});
    const before=medicalReads.length;
    await page.goto(`http://127.0.0.1:${port}/pets/dog-1/vet-visits`,{waitUntil:'domcontentloaded'});
    const summary=page.locator('details summary').first();
    await summary.waitFor({state:'visible',timeout:16000});
    await page.evaluate(()=>document.fonts.ready);
    const closed=await page.evaluate(()=>({
      h1:[...document.querySelectorAll('h1')].filter(x=>x.textContent?.trim()==='Посещения врача').length,
      details:document.querySelectorAll('details').length,
      open:document.querySelectorAll('details[open]').length,
      privateVisible:document.body.innerText.includes('PRIVATE_VISUAL_DIAGNOSIS'),
      bodyWidth:document.documentElement.scrollWidth,
      summary:document.querySelector('details summary')?.textContent?.trim(),
    }));
    if(closed.h1!==1||closed.details!==2||closed.open!==0||closed.privateVisible||
      closed.bodyWidth>v.width||medicalReads.length-before!==1)
      throw Error('WEB2_VET_HISTORY_COLLAPSED_FAILED_'+v.name+':'+JSON.stringify(closed));
    await page.screenshot({path:output+'/vet-history-'+v.name+'-vite.png',fullPage:true,animations:'disabled'});
    await summary.click();
    await page.getByText('PRIVATE_VISUAL_DIAGNOSIS').waitFor({state:'visible',timeout:12000});
    try {await page.waitForFunction(() => {
      const img=document.querySelector('details[open] img[alt="Медкарта.pdf"]');
      return img?.complete && img.naturalWidth > 0;
    },undefined,{timeout:7000});} catch(error) {
      console.log('WEB2_VET_IMAGE_DIAGNOSTIC',JSON.stringify(await page.evaluate(()=>{
        const i=document.querySelector('details[open] img[alt="Медкарта.pdf"]');
        return {src:i?.src,complete:i?.complete,naturalWidth:i?.naturalWidth};
      })));
      console.log('WEB2_VET_IMAGE_REQUESTS',JSON.stringify(medicalReads.slice(before)));
      console.log('WEB2_VET_UNEXPECTED_REQUESTS',JSON.stringify(requests));
      await page.screenshot({path:output+'/vet-image-diagnostic-'+v.name+'.png',fullPage:true});
      throw error;
    }
    const open=await page.evaluate(()=>{
      const root=document.querySelector('details[open]');
      const img=root?.querySelector('img[alt="Медкарта.pdf"]');
      const r=root?.getBoundingClientRect();
      return {expanded:!!root,detailWidth:Math.round(r?.width??0),
        diagnosis:root?.textContent?.includes('PRIVATE_VISUAL_DIAGNOSIS'),
        notes:root?.textContent?.includes('PRIVATE_VISUAL_VET_NOTES'),
        image:!!img,previewLoaded:!!img?.complete&&img.naturalWidth>0,
        pdfName:root?.textContent?.includes('Медкарта.pdf'),
        bodyWidth:document.documentElement.scrollWidth};
    });
    if(!open.expanded||!open.diagnosis||!open.notes||!open.image||
      !open.previewLoaded||!open.pdfName||open.bodyWidth>v.width)
      throw Error('WEB2_VET_HISTORY_EXPANDED_FAILED_'+v.name+':'+JSON.stringify(open));
    await page.screenshot({path:output+'/vet-history-expanded-'+v.name+'-vite.png',fullPage:true,animations:'disabled'});
    await page.locator('details summary').nth(1).click();
    await page.getByText('PRIVATE_VISUAL_MEDICAL_B').waitFor({state:'visible',timeout:12000});
    const both=await page.evaluate(()=>({
      expanded:document.querySelectorAll('details[open]').length,
      a:document.querySelectorAll('details')[0]?.textContent?.includes('PRIVATE_VISUAL_DIAGNOSIS'),
      b:document.querySelectorAll('details')[1]?.textContent?.includes('PRIVATE_VISUAL_MEDICAL_B'),
      scrollWidth:document.documentElement.scrollWidth,
    }));
    if(both.expanded!==2||!both.a||!both.b||both.scrollWidth>v.width)
      throw Error('WEB2_VET_TWO_OPEN_FAILED_'+v.name+':'+JSON.stringify(both));
    await page.screenshot({path:output+'/vet-history-both-'+v.name+'-vite.png',fullPage:true,animations:'disabled'});
    await summary.click();
    const left=await page.evaluate(()=>({
      expanded:document.querySelectorAll('details[open]').length,
      aVisible:document.body.innerText.includes('PRIVATE_VISUAL_CONCLUSION'),
      bVisible:document.body.innerText.includes('PRIVATE_VISUAL_MEDICAL_B'),
    }));
    if(left.expanded!==1||left.aVisible||!left.bVisible)
      throw Error('WEB2_VET_ONE_CLOSE_FAILED_'+v.name+':'+JSON.stringify(left));
    await page.locator('details summary').nth(1).click();
    const privateHidden=await page.evaluate(()=>
      !document.body.innerText.includes('PRIVATE_VISUAL_DIAGNOSIS')&&
      !document.body.innerText.includes('PRIVATE_VISUAL_MEDICAL_B')&&
      document.querySelectorAll('details[open]').length===0);
    if(!privateHidden||medicalReads.some(r=>r.method!=='GET'))
      throw Error('WEB2_VET_HISTORY_CLOSE_OR_WRITE_FAILED_'+v.name);
    records.push({viewport:v.name,width:v.width,height:v.height,closed,open,both,left,privateHidden,
      medicalReads:medicalReads.slice(before).map(x=>new URL(x.url).pathname)});
    console.log('WEB2_VET_LOADED_HISTORY',JSON.stringify(records.at(-1)));
  }
  writeFileSync(output+'/geometry.json',JSON.stringify({records,errors,requests},null,2));
  if(errors.length||requests.length)throw Error('WEB2_VET_VISUAL_ERRORS_'+JSON.stringify({errors,requests}));
  await ctx.close();
}finally{await browser?.close();server.kill("SIGTERM");await Promise.race([new Promise(resolve=>server.on("exit",resolve)),delay(1500)]);}
