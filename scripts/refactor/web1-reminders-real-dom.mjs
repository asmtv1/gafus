/** WEB1 source-derived Reminders DOM + CTA actual Chromium/Hono/isolated WORK SQL.
 * No source NextAuth fixture, no mocked API, no production or external provider.
 * HTML reference: retained Next TrainingReminders.tsx and PrimaryButton.tsx. */
import {existsSync,lstatSync,readFileSync,mkdirSync} from 'node:fs';
import {chromium} from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
const root='/Users/asmtv1/Desktop/gafus-refactor';
const lease=root+'/.local-pg-scratch/web1-unified-private.json';
const output=root+'/.design-verify/web1-reminders-real-loaded-dom-20261026';
const origin='http://127.0.0.1:5373',apiRoot='/api/v1';
if(process.cwd()!==root||process.env.GAFUS_WEB1_REAL_BROWSER!=='1'||
 process.env.GAFUS_WEB1_ALT_VITE_PORT!=='5373'||!existsSync(lease)||
 lstatSync(lease).isSymbolicLink())throw Error('WEB1_REMINDERS_SCOPE_DENIED');
const users=JSON.parse(readFileSync(lease,'utf8')).users;
if(users?.length!==2||!users.every(u=>
 u.username==='web1_unified_'+u.id.replaceAll('-','')))
 throw Error('WEB1_REMINDERS_LEASE_NOT_SYNTHETIC');
const chrome=root+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if(!existsSync(chrome))throw Error('WEB1_REMINDERS_CHROME_MISSING');
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:chrome,
 args:['--no-sandbox','--disable-background-networking','--disable-gpu'],
 env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',
 HOME:root+'/.local-browser-mcp/.cache/home',
 XDG_CACHE_HOME:root+'/.local-browser-mcp/.cache/tmp'}});
let assertions=0;
function assert(ok,msg){if(!ok)throw Error('WEB1_REMINDERS_CHROMIUM_SQL_FAIL '+msg);assertions++;}
async function api(page,url,method='GET',body){
 return page.evaluate(async ({url,method,body})=>{
  const r=await fetch(url,{method,credentials:'include',cache:'no-store',
   headers:{...(body?{'content-type':'application/json'}:{}),
    ...(method!=='GET'?{'X-Gafus-Auth-Transport':'cookie'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  let json;try{json=await r.json();}catch{json=null;}
  return {status:r.status,json};
 },{url,method,body});
}
async function run(view){
 const context=await browser.newContext({viewport:{width:view.w,height:view.h},
  deviceScaleFactor:1,locale:'ru-RU',reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.port!=='5373')
   return route.abort();
  return route.continue(u.pathname.startsWith('/api/v1/')?{
   headers:{...route.request().headers(),
    'x-real-ip':`198.18.232.${view.w===390?'39':'80'}`}}:{});
 });
 const page=await context.newPage();let createdId=null;
 try{
  await page.goto(origin+'/login',{waitUntil:'domcontentloaded',timeout:18000});
  const login=await api(page,apiRoot+'/auth/login','POST',{
   username:users[0].username,password:users[0].password});
  assert(login.status===200,'synthetic cookie login');
  const before=await api(page,apiRoot+'/reminders');
  assert(before.status===200&&Array.isArray(before.json?.data)&&
   before.json.data.length===0,'clean owner reminder SQL fixture');
  await page.goto(origin+'/reminders',{waitUntil:'domcontentloaded',timeout:18000});
  const add=page.getByRole('button',{name:'+ Добавить напоминание (0/5)'});
  await add.waitFor({state:'visible',timeout:16000});
  await page.evaluate(async()=>{await document.fonts.ready;});
  const initial=await add.evaluate(el=>{
   const css=getComputedStyle(el),list=document.querySelector('.reminder-list');
   return {className:el.className,tag:el.tagName,minHeight:css.minHeight,
    background:css.backgroundImage,display:css.display,
    width:Math.round(el.getBoundingClientRect().width),
    listTag:list?.tagName,listPadding:list?getComputedStyle(list).paddingLeft:null};
  });
  assert(initial.tag==='BUTTON'&&initial.className.includes('gafus-primary-button')&&
   initial.className.includes('fullWidth'),'exact source PrimaryButton classes');
  assert(initial.minHeight==='52px'&&initial.background.startsWith('linear-gradient'),
   'real source 52px olive primary CTA CSS loaded');
  assert(initial.listTag==='DIV'&&initial.listPadding==='0px',
   'original source reminder list div has no ul default padding');
  await add.click();
  const row=page.locator('[data-next-reminder-row]');
  await row.waitFor({state:'visible',timeout:20000});
  const sourceDom=await row.evaluate(el=>({
   tag:el.tagName,parentTag:el.parentElement?.tagName,
   parentClass:el.parentElement?.className,
   name:el.querySelector('input[aria-label="Название напоминания"]')?.value,
   time:el.textContent,
  }));
  assert(sourceDom.tag==='DIV'&&sourceDom.parentTag==='DIV'&&
   sourceDom.parentClass.includes('remindersList'),
   'original Next div.remindersList > div.reminderItem on real SQL row');
  assert(sourceDom.name==='задай название 1'&&sourceDom.time.includes('09:00'),
   'source quick-create row name and default time');
  const rows=await api(page,apiRoot+'/reminders');
  assert(rows.status===200&&Array.isArray(rows.json?.data)&&rows.json.data.length===1,
   'Hono->Core->SQL persistent owner quick-create GET');
  createdId=rows.json.data[0].id;
  assert(row&&createdId===await row.getAttribute('data-reminder-id'),
   'real DOM identity equals Core persisted owner row');
  await page.screenshot({path:output+`/reminders-${view.name}-vite-loaded.png`,fullPage:false});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator(`[data-reminder-id="${createdId}"]`).waitFor({timeout:15000});
  assert(true,'real hard reload preserved created owner reminder');
  console.log('WEB1_REMINDERS_REAL_DOM',view.name,JSON.stringify({initial,sourceDom,
   screenshot:output+`/reminders-${view.name}-vite-loaded.png`}));
 }finally{
  if(createdId){
   const result=await api(page,apiRoot+'/reminders/'+createdId,'DELETE');
   assert(result.status===200,'delete exactly current verified synthetic reminder');
   const remaining=await api(page,apiRoot+'/reminders');
   assert(remaining.status===200&&
    !remaining.json?.data?.some(r=>r.id===createdId),
    'owner SQL cleanup GET excludes synthetic reminder');
  }
  await context.close();
 }
}
try{
 await run({name:'desktop',w:1280,h:800});
 await run({name:'mobile',w:390,h:844});
 console.log('WEB1_REMINDERS_SOURCE_DOM_REAL_SQL_PASS assertions='+assertions);
}finally{await browser.close();}
