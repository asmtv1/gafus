/** Read-only Hono /auth/me role -> actual Vite menu parity fixture. */
import { chromium } from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==ROOT) throw Error('WRONG_PROJECT_ROOT');
const OUT=ROOT+'/.design-verify/header-trainer-panel-role-20261026';
if(existsSync(OUT)) throw Error('OUTPUT_EXISTS');
mkdirSync(OUT,{recursive:true});
const chrome=ROOT+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if(!existsSync(chrome)) throw Error('CHROMIUM_NOT_AVAILABLE');
const browser=await chromium.launch({headless:true,executablePath:chrome,
 args:['--no-sandbox','--disable-background-networking','--disable-gpu']});
const scenarios=[
 {role:'TRAINER',view:'desktop',w:1280,h:800,visible:true},
 {role:'ADMIN',view:'mobile',w:390,h:844,visible:true},
 {role:'MODERATOR',view:'mobile',w:390,h:844,visible:true},
 {role:'USER',view:'desktop',w:1280,h:800,visible:false},
 {role:'PARTNER',view:'mobile',w:390,h:844,visible:false},
];
const results=[];
try{
 for(const s of scenarios){
  const context=await browser.newContext({viewport:{width:s.w,height:s.h},deviceScaleFactor:1,
   reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage(); const errors=[],writes=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const r=route.request(),u=new URL(r.url());
   if(!['localhost','127.0.0.1'].includes(u.hostname)){
    external.push(u.hostname);return route.abort();
   }
   if(u.pathname.startsWith('/api/v1/')){
    if(r.method()!=='GET'){writes.push(r.method()+' '+u.pathname);return route.abort();}
    let data=null;
    if(u.pathname==='/api/v1/auth/me')data={id:'synthetic_owner',username:'fixture',role:s.role};
    if(u.pathname==='/api/v1/articles')data=[];
    if(u.pathname==='/api/v1/user/onboarding-tour')data={completed:true};
    return route.fulfill({status:data===null?404:200,contentType:'application/json',
      body:JSON.stringify(data===null?{success:false,error:'Not in fixture'}:{success:true,data})});
   }
   return route.continue();
  });
  await page.goto('http://127.0.0.1:5173/articles',{waitUntil:'domcontentloaded',timeout:15000});
  await page.getByRole('button',{name:'Открыть меню'}).click();
  const nav=page.getByRole('navigation',{name:'Разделы'});
  const panel=nav.getByRole('link',{name:'Панель тренера'});
  if(s.visible){
   await panel.waitFor({state:'visible',timeout:10000});
   await panel.locator('img').evaluate(img=>img.loading='eager');
   await page.waitForFunction(()=>{
    const img=document.querySelector('nav a[href="https://trainer-panel.gafus.ru/"] img');
    return img&&img.complete&&img.naturalWidth>0;
   },undefined,{timeout:12000});
  }
  const info=await page.evaluate(()=>{
   const nav=document.querySelector('nav[aria-label="Разделы"]');
   const links=[...nav.querySelectorAll('a')];
   const panel=links.find(a=>a.textContent.trim()==='Панель тренера');
   const articles=links.findIndex(a=>a.getAttribute('href')==='/articles');
   const panelIndex=links.indexOf(panel);
   const image=panel?.querySelector('img');
   const h=panel?.getBoundingClientRect().height??null;
   const logout=[...nav.querySelectorAll('button')].find(b=>b.textContent.includes('Выход'));
   return {visible:!!panel,href:panel?.getAttribute('href')??null,
    iconSrc:image?.getAttribute('src')??null,iconLoaded:image?image.naturalWidth>0:null,
    afterArticles:panelIndex===articles+1,beforeLogout:panel&&logout?!!(panel.compareDocumentPosition(logout)&Node.DOCUMENT_POSITION_FOLLOWING):null,
    height:h,logoutPresent:!!logout,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  if(s.visible){
   await panel.scrollIntoViewIfNeeded();
   await page.screenshot({path:`${OUT}/${s.role.toLowerCase()}-${s.view}.png`,animations:'disabled'});
  }
  const pass=info.visible===s.visible&&info.logoutPresent&&!info.overflow&&
   (!s.visible||info.href==='https://trainer-panel.gafus.ru/'&&
    info.iconSrc==='/images/profile-icons/trainer-notes.webp'&&
    info.iconLoaded&&info.afterArticles&&info.beforeLogout&&info.height>=50)&&
   errors.length===0&&writes.length===0&&external.length===0;
  results.push({role:s.role,viewport:s.view,pass,...info,errors,writes,external});
  await context.close();
 }
}finally{await browser.close();}
writeFileSync(OUT+'/matrix.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
if(results.some(r=>!r.pass))process.exitCode=1;
