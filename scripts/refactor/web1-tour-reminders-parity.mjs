/** Genuine Next SSR versus Vite UI, same WORK synthetic owner, viewports/data.
 * Next server runs with a hard env lock, Hono is the unmocked Vite backend.
 */
import { createRequire } from 'node:module';
import { existsSync, lstatSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==ROOT||process.env.GAFUS_WEB1_REAL_BROWSER!=='1'||!process.env.NEXTAUTH_SECRET)
 throw Error('WEB1_PARITY_SANDBOX_DENIED');
const lease=ROOT+'/.local-pg-scratch/web1-unified-private.json';
if(!existsSync(lease)||lstatSync(lease).isSymbolicLink())throw Error('WEB1_PARITY_LEASE_DENIED');
const data=JSON.parse(readFileSync(lease,'utf8'));
const user=data.users?.[0];
if(data.users?.length!==2||user.username!=='web1_unified_'+user.id.replaceAll('-',''))
 throw Error('WEB1_PARITY_FIXTURE_DENIED');
const nextRequire=createRequire(join(ROOT,'apps/web/package.json'));
const {encode}=nextRequire('next-auth/jwt');
const token=await encode({token:{sub:user.id,id:user.id,username:user.username,
 name:'WEB1 Собаковод А',role:'USER',email:`${user.username}@example.test`,
 authenticatedAt:Date.now()},secret:process.env.NEXTAUTH_SECRET});
// Focused validation of two changed WEB1 routes; full 16-pair round7 remains
// the independently complete baseline with the SAME comparator threshold.
const screen=[
 {id:'reminders',path:'/reminders',selector:'[data-next-reminders]'},
 {id:'tour',path:'/profile?tab=settings',selector:'[data-next-onboarding-tour]'},
];
const viewports=[{name:'desktop',width:1280,height:800},{name:'mobile',width:390,height:844}];
const base=ROOT+'/.design-verify/web1-tour-reminders-focus-commit-20261026';mkdirSync(base,{recursive:true});
const chrome=ROOT+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if(!existsSync(chrome))throw Error('WEB1_PARITY_CHROME_MISSING');
const browser=await chromium.launch({headless:true,executablePath:chrome,args:['--no-sandbox','--disable-background-networking','--disable-gpu'],
 env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:ROOT+'/.local-browser-mcp/.cache/home',XDG_CACHE_HOME:ROOT+'/.local-browser-mcp/.cache/tmp'}});
const matrix=[];
const failures=[];
async function pageFor(kind,v){
 const isNext=kind==='next';
 const nextPort=process.env.GAFUS_WEB1_FOCUS_NEXT_PORT==='4302'?4302:
   process.env.GAFUS_WEB1_ALT_NEXT_PORT==='3302'?3302:3002;
 const vitePort=process.env.GAFUS_WEB1_ALT_VITE_PORT==='5373'?5373:5173;
 const baseUrl=isNext?`http://127.0.0.1:${nextPort}`:`http://127.0.0.1:${vitePort}`;
 let screenIndex=0;
 const context=await browser.newContext({viewport:{width:v.width,height:v.height},locale:'ru-RU',deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
 await context.addInitScript(()=>{
   try{localStorage.setItem('gafus:cookieConsent:v1','accepted');}catch{}
 });
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||
    !['3001','3002','3301','3302','4302','5173','5373'].includes(u.port))return route.abort();
  if(!isNext&&u.port===String(vitePort)&&u.pathname.startsWith('/api/v1/'))
   return route.continue({headers:{...route.request().headers(),
    'x-real-ip':'198.19.'+String(process.pid%250)+'.'+String((v.width%100+screenIndex*13)%230+1)}});
  return route.continue();
 });
 if(isNext){await context.addCookies([{name:'next-auth.session-token',value:token,
  url:baseUrl,httpOnly:true,secure:false,sameSite:'Lax'}]);}
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(!isNext){
  await page.goto(baseUrl+'/login',{waitUntil:'domcontentloaded',timeout:15000});
  const login=await page.evaluate(async x=>{
   const r=await fetch('/api/v1/auth/login',{method:'POST',credentials:'include',
    headers:{'content-type':'application/json','x-gafus-auth-transport':'cookie'},
    body:JSON.stringify(x)});return r.status;
  },{username:user.username,password:user.password});
  if(login!==200)throw Error('WEB1_PARITY_VITE_LOGIN_'+login);
 }
 return {context,page,errors,baseUrl,setScreenIndex(index){screenIndex=index;}};
}
async function capture(session,kind,v,s){
 const {page,baseUrl,errors}=session;
 const url=baseUrl+s.path;
 let status=0,selectorOk=false,reason='',layout=null;
 try{
  // Next can stream a correct 200 HTML response while DCL waits for
  // nonessential chunk loading. Commit plus a REAL semantic selector is the
  // stricter UI proof; do not use HTTP 200 alone as parity.
  const res=await page.goto(url,{waitUntil:'commit',timeout:120000});
  if(kind==='next'&&s.id==='reminders')
   await page.getByRole('heading',{name:'Напоминания о тренировках',exact:true})
    .first().waitFor({state:'visible',timeout:30000});
  status=res?.status()??0;
  await page.waitForTimeout(650);
  try{await page.waitForLoadState('networkidle',{timeout:3000});}catch{}
  await page.evaluate(async()=>{await document.fonts.ready;});
  if(s.id==='tour'){
   // A 200 document is not evidence of a mounted Next overlay. First prove
   // the original settings button is hydrated, click it, then assert the
   // actual source Next *card* and progress rather than body text.
   const button=page.getByRole('button',{name:'Повторить экскурсию',exact:true});
   await button.waitFor({state:'visible',timeout:24000});
   await button.click();
   const card=kind==='next'?
     page.locator('[class*="TourOverlay_card"]'):
     page.getByRole('dialog',{name:'Экскурсия по GAFUS'});
   await card.waitFor({state:'visible',timeout:16000});
   const tourCopy=await card.innerText();
   if(!tourCopy.includes('Быстрый тур')||!tourCopy.includes('1/9')||
     !tourCopy.includes('Пропустить')||!tourCopy.includes('Далее'))
     throw Error('WEB1_ACTUAL_TOUR_CARD_NOT_SOURCE_STEP1');
  }
  // Next has source components without Vite-specific data-attrs. Read semantic
  // markup as proof rather than falsely requiring the Vite data attributes.
  const target=kind==='vite'?s.selector:'body';
  if(kind==='vite'){
   try{await page.locator(target).waitFor({timeout:12000});}catch{}
  }
  selectorOk=await page.locator(target).count()>0;
  if(kind==='next'&&s.path.startsWith('/profile')&&s.id!=='bio'){
   const body=await page.locator('body').innerText();
   selectorOk=selectorOk&&body.includes('WEB1 Собаковод А');
  }
  if(kind==='next'&&s.id==='bio')selectorOk=selectorOk&&
    (await page.locator('body').innerText()).includes('Редактировать «О себе»');
  if(s.id==='tour')selectorOk=selectorOk&&(kind==='next' ?
    await page.locator('[class*="TourOverlay_card"]').count()>0 :
    await page.getByRole('dialog',{name:'Экскурсия по GAFUS'}).count()>0);
  layout=await page.evaluate(()=>{
   const pick=(selector)=>{
    const el=document.querySelector(selector);if(!el)return null;
    const r=el.getBoundingClientRect(),css=getComputedStyle(el);
    return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),
      h:Math.round(r.height),font:css.fontFamily,fontSize:css.fontSize,
      background:css.backgroundColor,display:css.display};
   };
   const firstHeading=[...document.querySelectorAll('h1')].map(el=>({text:el.textContent,
    x:Math.round(el.getBoundingClientRect().x),y:Math.round(el.getBoundingClientRect().y)}));
   return {title:firstHeading,main:pick('main'),banner:pick('[class*=profileBanner]'),
    profileShell:pick('[class*=profileShell]'),identity:pick('[data-next-profile-identity]'),
    settings:pick('[data-next-profile-settings]'),reminder:pick('[data-next-reminders]'),
    panel:pick('[class*=container]'),tour:pick('[class*=card][style*=top]')};
  });
  await page.screenshot({path:base+'/'+s.id+'-'+v.name+'-'+kind+'.png',fullPage:s.id!=='tour',animations:'disabled',timeout:20000});
 }catch(error){reason=error instanceof Error?error.message.slice(0,250):String(error);}
 return {status,selectorOk,errors:errors.slice(),reason,layout,
  urlPath:s.path,screenshot:s.id+'-'+v.name+'-'+kind+'.png'};
}
try{
 for(const v of viewports){
  const next=await pageFor('next',v);
  const vite=await pageFor('vite',v);
  try{
   for(const [i,s] of screen.entries()){
    vite.setScreenIndex(i);
    const n=await capture(next,'next',v,s);
    const t=await capture(vite,'vite',v,s);
    const entry={screen:s.id,viewport:v.name,next:n,vite:t};matrix.push(entry);
    console.log('WEB1_VISUAL_PAIR',s.id,v.name,'NEXT',n.status,n.selectorOk,
      'VITE',t.status,t.selectorOk,(!n.reason&&!t.reason?'screenshots':'diagnostic'));
    if(n.status!==200||t.status!==200||!n.selectorOk||!t.selectorOk||n.reason||t.reason)
     failures.push(entry);
   }
  }finally{await next.context.close();await vite.context.close();}
 }
}finally{
 writeFileSync(base+'/matrix.json',JSON.stringify({fixture:'same synthetic WORK DB owner',
  nextPort:process.env.GAFUS_WEB1_FOCUS_NEXT_PORT==='4302'?4302:
    process.env.GAFUS_WEB1_ALT_NEXT_PORT==='3302'?3302:3002,
  vitePort:process.env.GAFUS_WEB1_ALT_VITE_PORT==='5373'?5373:5173,
  viewports,screens:matrix,failed:failures.length},null,2));
 await browser.close();
}
console.log('WEB1_PARITY_CAPTURED',matrix.length,'FAILED',failures.length,'OUTPUT',base);
if(failures.length)process.exitCode=1;
