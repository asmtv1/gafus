/** Real Chromium UI->cookie Hono->Core->WORK SQL->DEV Stream->trainer reload.
 * No synthetic network responses, no remote writes outside the pinned dev Stream.
 */
import {existsSync,lstatSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
const LEASE=join(ROOT,'.local-pg-scratch/web5-visual-private.json');
const OUTPUT=join(ROOT,'.design-verify/web5-live-browser-sql-stream-20261026-r5');
const CHROME=join(ROOT,'.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell');
if(process.cwd()!==ROOT||process.env.GAFUS_WEB5_BROWSER_LIVE!=='1'||!existsSync(LEASE)||
 lstatSync(LEASE).isSymbolicLink()||!existsSync(CHROME)||existsSync(OUTPUT))
 throw Error('WEB5_BROWSER_LIVE_PRECONDITION_DENIED');
const lease=JSON.parse(readFileSync(LEASE,'utf8'));
if(lease.owners?.length!==2||!lease.chatId||!lease.channelId||
 !lease.owners.every(o=>o.username===`web5_visual_${o.id.replaceAll('-','')}`))
 throw Error('WEB5_BROWSER_LIVE_OWNERSHIP_DENIED');
mkdirSync(OUTPUT,{recursive:false});
const text=`WEB5_BROWSER_E2E_SENT_${lease.owners[0].id.replaceAll('-','')}`;
const evidence={flow:'REAL browser cookie -> Hono -> Core -> PostgreSQL -> development Stream -> reload',
  expectedMessage:text,stages:[],http:[],failures:[]};
const browser=await chromium.launch({headless:true,executablePath:CHROME,
 args:['--no-sandbox','--disable-background-networking'],
 env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:join(ROOT,'.local-browser-mcp/.cache/home'),
 XDG_CACHE_HOME:join(ROOT,'.local-browser-mcp/.cache/tmp')}});
const sessions=[];
async function session(owner,viewport){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:1,locale:'ru-RU',serviceWorkers:'block',
  reducedMotion:'reduce',colorScheme:'light'});
 sessions.push(ctx);
 const page=await ctx.newPage();
 page.on('response',r=>{try{const url=new URL(r.url());
  if(url.hostname==='127.0.0.1'&&url.pathname.startsWith('/api/v1/'))
   evidence.http.push({path:url.pathname,status:r.status(),method:r.request().method()});
 }catch{}});
 page.on('pageerror',e=>evidence.failures.push('PAGE_'+e.name));
 // Emulate the trusted nginx X-Real-IP of *two distinct* clients in this
 // loopback-only test. Production nginx overwrites this header. No Redis
 // rate-limit settings/keys are changed, and both clients remain rate-limited.
 const seed=owner.id.replaceAll('-','');
 const loopbackIp=`127.0.${parseInt(seed.slice(0,2),16)}.${parseInt(seed.slice(2,4),16)}`;
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  const local=url.hostname==='127.0.0.1'&&['5173','3001'].includes(url.port);
  const stream=['https:','wss:'].includes(url.protocol)&&
   (url.hostname.endsWith('.stream-io-api.com')||url.hostname.endsWith('.getstream.io')||
    url.hostname==='stream-io-api.com'||url.hostname==='getstream.io');
  if(local)return route.continue({headers:{...route.request().headers(),'x-real-ip':loopbackIp}});
  if(stream)return route.continue();
  return route.abort();
 });
 await page.goto('http://127.0.0.1:5173/login',{waitUntil:'domcontentloaded',timeout:30000});
 // Handle the actual site's cookie choice through a real user-visible click.
 const consent=page.getByRole('button',{name:'Принять',exact:true});
 if(await consent.isVisible({timeout:4000}).catch(()=>false))
   await consent.click({timeout:12000});
 await page.locator('#login-name').fill(owner.username);
 await page.locator('#login-password').fill(owner.password);
 await page.getByRole('button',{name:'Войти',exact:true}).click();
 await page.getByText(`Пользователь: ${owner.username}`,{exact:false})
   .first().waitFor({state:'visible',timeout:20000});
 evidence.loginCookieMeta=(await ctx.cookies('http://127.0.0.1:5173/api/v1/auth/me')).map(c=>({
  name:c.name,path:c.path,secure:c.secure,sameSite:c.sameSite}));
 evidence.firstMeStatus=await page.evaluate(async()=>
  (await fetch('/api/v1/auth/me',{credentials:'include',cache:'no-store'})).status);
 console.log('WEB5_BROWSER_AFTER_LOGIN_ME',evidence.firstMeStatus,
  'COOKIE_NAMES',evidence.loginCookieMeta.map(c=>c.name).join(','));
 if(evidence.firstMeStatus!==200)throw Error('WEB5_BROWSER_SECURE_COOKIE_NOT_ACTIVE_'+evidence.firstMeStatus);
 evidence.stages.push('REAL_WEB_COOKIE_LOGIN_AND_ME_200');
 return page;
}
async function online(page,description){
 try{await page.getByText('На связи',{exact:true}).first().waitFor({state:'visible',timeout:50000});}
 catch{const body=(await page.locator('body').innerText()).slice(0,600);
  console.error(`WEB5_BROWSER_${description}_DIAG`,body.replaceAll(/web5_visual_[a-z0-9]+/g,'[SYNTHETIC_ACCOUNT]'));
  throw Error(`WEB5_BROWSER_${description}_OFFLINE`);}
}
try{
 const client=await session(lease.owners[0],{width:1280,height:800});
 await client.goto('http://127.0.0.1:5173/cynologist-chat',{waitUntil:'domcontentloaded'});
 await online(client,'CLIENT');
 evidence.stages.push('CLIENT_REAL_STREAM_WEBSOCKET_CONNECTED');
 await client.screenshot({path:join(OUTPUT,'client-before-desktop.png'),animations:'disabled'});
 await client.getByRole('textbox',{name:'Текст сообщения'}).fill(text);
 await client.getByRole('button',{name:'Отправить',exact:true}).click();
 await client.getByText(text,{exact:true}).first().waitFor({state:'visible',timeout:45000});
 evidence.stages.push('CLIENT_SEND_HONO_AND_STREAM_RENDER_PASS');
 await client.screenshot({path:join(OUTPUT,'client-after-desktop.png'),animations:'disabled'});
 const trainer=await session(lease.owners[1],{width:390,height:844});
 const trainerPath=`http://127.0.0.1:5173/cynologist-chats/${lease.chatId}`;
 await trainer.goto(trainerPath,{waitUntil:'domcontentloaded'});
 await online(trainer,'TRAINER');
 await trainer.getByText(text,{exact:true}).first().waitFor({state:'visible',timeout:45000});
 evidence.stages.push('TRAINER_SECOND_IDENTITY_RECEIVE_PASS');
 await trainer.screenshot({path:join(OUTPUT,'trainer-before-reload-mobile.png'),animations:'disabled'});
 await trainer.reload({waitUntil:'domcontentloaded'});
 await online(trainer,'TRAINER_RELOAD');
 await trainer.getByText(text,{exact:true}).first().waitFor({state:'visible',timeout:45000});
 await trainer.screenshot({path:join(OUTPUT,'trainer-after-reload-mobile.png'),animations:'disabled'});
 evidence.stages.push('TRAINER_REAL_SQL_STREAM_RELOAD_PASS');
 await client.reload({waitUntil:'domcontentloaded'});
 await online(client,'CLIENT_RELOAD');
 await client.getByText(text,{exact:true}).first().waitFor({state:'visible',timeout:45000});
 evidence.stages.push('CLIENT_RELOAD_PASS');
 console.log('WEB5_BROWSER_REAL_VITE_HONO_STREAM_RELOAD=PASS');
}catch(e){evidence.failures.push(String(e instanceof Error?e.message:'UNKNOWN').slice(0,400));
 console.error('WEB5_BROWSER_REAL_E2E_FAIL',e instanceof Error?e.message:'UNKNOWN');process.exitCode=1;
}finally{
 writeFileSync(join(OUTPUT,'evidence.json'),JSON.stringify(evidence,null,2));
 for(const ctx of sessions)await ctx.close().catch(()=>undefined);
 await browser.close();
}
