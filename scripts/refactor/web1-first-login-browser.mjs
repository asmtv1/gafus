/* Real mounted Chromium + Hono + WORK PostgreSQL first-visit onboarding.
   ALL requests restricted to the current GAFUS Refactor loopback. */
import {readFileSync,lstatSync} from 'node:fs';
import {chromium} from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
const root='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==root||process.env.GAFUS_WEB1_REAL_BROWSER!=='1')
 throw Error('WEB1_FIRST_VISIT_SCOPE_DENIED');
const lease=root+'/.local-pg-scratch/web1-unified-private.json';
if(lstatSync(lease).isSymbolicLink())throw Error('WEB1_FIRST_VISIT_LEASE_SYMLINK');
const rows=JSON.parse(readFileSync(lease,'utf8')).users;
if(rows?.length!==2||!rows.every(x=>x.username==='web1_unified_'+x.id.replaceAll('-','')))
 throw Error('WEB1_FIRST_VISIT_FIXTURE_SCOPE_DENIED');
const browser=await chromium.launch({headless:true,
 executablePath:root+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell',
 args:['--no-sandbox','--disable-background-networking','--disable-gpu'],
 env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:root+'/.local-browser-mcp/.cache/home',
 XDG_CACHE_HOME:root+'/.local-browser-mcp/.cache/tmp'}});
const base='http://127.0.0.1:5173';let assertions=0;
const check=(x,label)=>{if(!x)throw Error('WEB1_FIRST_VISIT_FAIL:'+label);assertions++;};
async function start(user,ip){
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',
  serviceWorkers:'block'});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.port!=='5173')return route.abort();
  return route.continue(u.pathname.startsWith('/api/v1/')?{headers:{...route.request().headers(),
   'x-real-ip':ip}}:{});
 });
 const page=await context.newPage();
 await page.goto(base+'/login',{waitUntil:'domcontentloaded'});
 const login=await page.evaluate(async u=>{
  const response=await fetch('/api/v1/auth/login',{method:'POST',credentials:'include',
    headers:{'content-type':'application/json','x-gafus-auth-transport':'cookie'},
    body:JSON.stringify({username:u.username,password:u.password})});
  return response.status;
 },user);
 check(login===200,'browser real Hono login '+login);
 return {context,page};
}
const status=page=>page.evaluate(async()=>{
 const result=await fetch('/api/v1/user/onboarding-tour',{credentials:'include',cache:'no-store'});
 return {status:result.status,json:await result.json()};
});
try{
 const a=await start(rows[0],'198.19.241.11');
 try{
  const initial=await status(a.page);
  check(initial.status===200&&initial.json?.data?.hasSeenV1===false,'real initial SQL=false');
  await a.page.goto(base+'/profile?tab=settings',{waitUntil:'domcontentloaded'});
  const dialog=a.page.getByRole('dialog',{name:'Экскурсия по GAFUS'});
  await dialog.waitFor({timeout:17000});
  check(await dialog.isVisible(),'first-login autostart mounted');
  check((await status(a.page)).json?.data?.hasSeenV1===false,'read-only autostart');
  await dialog.getByRole('button',{name:'Пропустить'}).click();
  await dialog.waitFor({state:'hidden',timeout:13000});
  const completed=await status(a.page);
  check(completed.status===200&&completed.json?.data?.hasSeenV1===true,'Hono skip SQL persisted');
  await a.page.reload({waitUntil:'domcontentloaded'});
  await a.page.waitForTimeout(900);
  check(await dialog.count()===0,'skip persists on hard reload');
 }finally{await a.context.close();}
 const b=await start(rows[1],'198.19.241.12');
 try{
  check((await status(b.page)).json?.data?.hasSeenV1===true,
    'foreign completion state unchanged');
  await b.page.goto(base+'/profile?tab=settings',{waitUntil:'domcontentloaded'});
  await b.page.waitForTimeout(900);
  check(await b.page.getByRole('dialog',{name:'Экскурсия по GAFUS'}).count()===0,
    'owner first login not leaked to foreign');
 }finally{await b.context.close();}
 console.log('WEB1_FIRST_LOGIN_REAL_HONO_SQL_BROWSER_PASS assertions='+assertions);
}finally{await browser.close();}
