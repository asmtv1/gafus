/** Real owner-only Web logout-all against the disposable WEB1 WORK SQL fixture.
 * No mock API responses, static JWTs or production credentials. Creates only
 * temporary synthetic sessions for the two fixture users from the guarded lease.
 */
import {existsSync,lstatSync,readFileSync} from 'node:fs';
import {chromium} from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
const lease=ROOT+'/.local-pg-scratch/web1-unified-private.json';
if(process.cwd()!==ROOT||process.env.GAFUS_WEB1_REAL_BROWSER!=='1'||
 process.env.GAFUS_WEB1_ALT_VITE_PORT!=='5373'||
 !existsSync(lease)||lstatSync(lease).isSymbolicLink())
 throw Error('WEB1_LOGOUT_WORK_SCOPE_DENIED');
const users=JSON.parse(readFileSync(lease,'utf8')).users;
if(users?.length!==2||!users.every(u=>u.username==='web1_unified_'+u.id.replaceAll('-','')))
 throw Error('WEB1_LOGOUT_FIXTURE_IDENTITY_DENIED');
const [owner,foreign]=users;
const chrome=ROOT+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if(!existsSync(chrome))throw Error('WEB1_LOGOUT_CHROME_MISSING');
const browser=await chromium.launch({headless:true,executablePath:chrome,
 args:['--no-sandbox','--disable-background-networking','--disable-gpu'],
 env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:ROOT+'/.local-browser-mcp/.cache/home',
 XDG_CACHE_HOME:ROOT+'/.local-browser-mcp/.cache/tmp'}});
const path='/api/v1',origin='http://127.0.0.1:5373';
let assertions=0;
function test(ok,name){if(!ok)throw Error('WEB1_LOGOUT_REAL_SQL_FAIL:'+name);assertions++;}
async function api(page,url,method='GET',body){
 return page.evaluate(async({url,method,body})=>{
  const res=await fetch(url,{method,credentials:'include',cache:'no-store',headers:{
   ...(body?{'content-type':'application/json'}:{}),
   ...(method!=='GET'?{'X-Gafus-Auth-Transport':'cookie'}:{}),
  },...(body?{body:JSON.stringify(body)}:{})});
  let data;try{data=await res.json();}catch{data=null;}
  return {status:res.status,data};
 },{url,method,body});
}
async function open(user,ip){
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',
  deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:'reduce'});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.port!=='5373')
   return route.abort();
  return route.continue(u.pathname.startsWith(path+'/')?{
   headers:{...route.request().headers(),'x-real-ip':'198.19.137.'+ip}}:{});
 });
 const page=await context.newPage();
 await page.goto(origin+'/login',{waitUntil:'domcontentloaded',timeout:16000});
 const login=await api(page,path+'/auth/login','POST',{
  username:user.username,password:user.password,
 });
 test(login.status===200,'real browser session login');
 return {context,page};
}
const sessions=[];
try{
 const a=await open(owner,'41');sessions.push(a);
 const b=await open(owner,'42');sessions.push(b);
 const foreignSession=await open(foreign,'43');sessions.push(foreignSession);
 for(const [index,s] of sessions.entries()){
  const me=await api(s.page,path+'/auth/me');
  test(me.status===200&&me.data?.data?.id===(index===2?foreign.id:owner.id),
   'pre-revocation independently authenticated cookie '+index);
 }
 let logoutPosts=0;
 a.page.on('request',req=>{
  const u=new URL(req.url());
  if(u.pathname===path+'/auth/logout-all'&&req.method()==='POST')logoutPosts++;
 });
 await a.page.goto(origin+'/profile?tab=settings',{waitUntil:'domcontentloaded'});
 const trigger=a.page.getByRole('button',{name:'Выйти на всех устройствах',exact:true});
 await trigger.waitFor({state:'visible',timeout:20000});
 await trigger.click();
 const group=a.page.getByRole('group',{name:'Подтверждение выхода со всех устройств'});
 await group.waitFor({state:'visible',timeout:5000});
 test((await group.innerText()).includes('Android и iOS'),'genuine UI warns about Web and Mobile');
 await group.getByRole('button',{name:'Да, выйти на всех устройствах'}).click();
 await a.page.waitForURL(url=>url.pathname==='/',{timeout:16000});
 test(logoutPosts===1,'exactly one real browser revocation mutation');
 const afterA=await api(a.page,path+'/auth/me');
 test(afterA.status===401,'initiating browser cookies cleared after SQL commit');
 const afterB=await api(b.page,path+'/auth/me');
 test(afterB.status===401,'second browser old access JWT rejected by SQL epoch');
 const refreshB=await api(b.page,path+'/auth/refresh','POST',{});
 test([400,401,403].includes(refreshB.status),'second browser refresh token rejected after SQL revocation');
 const untouched=await api(foreignSession.page,path+'/auth/me');
 test(untouched.status===200&&untouched.data?.data?.id===foreign.id,
  'foreign account auth remains valid after owner logout-all');
 console.log('WEB1_REAL_LOGOUT_ALL_SQL_PASS assertions='+assertions+
  ' requestCount='+logoutPosts+' revokedOwnerOnly=true');
}finally{
 for(const session of sessions)await session.context.close();
 await browser.close();
}
