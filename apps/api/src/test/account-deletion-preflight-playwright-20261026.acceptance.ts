/** Non-destructive endpoint acceptance: Chromium -> Vite -> current Hono -> own WORK row.
 * One synthetic USER is created then safely retired by exact PK; no API account-delete,
 * no code-send provider, no S3 mutation, no global worker or cloud API.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { prisma } from '@gafus/prisma';
import playwright from '../../../../.local-browser-mcp/node_modules/playwright/index.js';
const { chromium } = playwright;
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
const code=randomBytes(7).toString('hex');
const username='delete_preflight_'+code;
const password=randomBytes(25).toString('base64url');
let ownerId='';
const pass=(x:string)=>console.warn('DELETE_PREFLIGHT_BROWSER_'+x+'=PASS');
function ensure(x:unknown,label:string):asserts x{if(!x)throw Error('PREFLIGHT_'+label);}
async function main(){
 ensure(process.env.ACCOUNT_PREFLIGHT_BROWSER_TEST==='1','EXPLICIT_TEST_FLAG');
 ensure(realpathSync(ROOT)===ROOT && realpathSync(process.cwd())===ROOT+'/apps/api','PROJECT_SCOPE');
 const d=new URL(process.env.DATABASE_URL??'');
 ensure(d.protocol==='postgresql:'&&d.hostname==='127.0.0.1'&&d.port==='55921'&&d.username==='gafus_refactor_local_real'&&d.pathname==='/gafus_refactor_real_work_20261024','RESTRICTED_WORK_DB');
 ensure(process.env.NODE_ENV==='development'&&process.env.GAFUS_LOCAL_ISOLATED_API==='1','LOCAL_API_GUARD');
 const bin=ROOT+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
 ensure(existsSync(bin)&&!lstatSync(bin).isSymbolicLink(),'LOCAL_BROWSER');
 ensure((await fetch('http://127.0.0.1:3001/ready',{signal:AbortSignal.timeout(3000)})).status===200,'HONO_LIVE');
 ensure((await fetch('http://127.0.0.1:5173/',{signal:AbortSignal.timeout(3000)})).status===200,'VITE_LIVE');
 const owner=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),passwordSetAt:new Date(),registrationPending:false,role:'USER',email:username+'@example.invalid'}});
 ownerId=owner.id;
 const fakeAvatar='isodev-avatar:documents/uploads/users/'+owner.id+'/avatar/'+randomUUID()+'.png';
 await prisma.userProfile.create({data:{userId:owner.id,avatarUrl:fakeAvatar}});
 const browser=await chromium.launch({headless:true,executablePath:bin,args:['--no-sandbox','--disable-background-networking'],env:{PATH:'/usr/bin:/bin:/opt/homebrew/bin',HOME:ROOT+'/.local-browser-mcp/.cache/home',TMPDIR:ROOT+'/.local-browser-mcp/.cache/tmp',XDG_CACHE_HOME:ROOT+'/.local-browser-mcp/.cache/tmp'}});
 try {
  const context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:false,serviceWorkers:'block',locale:'ru-RU'});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url()),m=route.request().method();
   if(u.origin!=='http://127.0.0.1:5173')return route.abort('blockedbyclient');
   if(m!=='GET'&&m!=='HEAD'&&!(m==='POST'&&['/api/v1/auth/login','/api/v1/auth/refresh'].includes(u.pathname)))return route.abort('blockedbyclient');
   return route.continue();
  });
  const page=await context.newPage();const exceptions:string[]=[];const reads:Array<{path:string;status:number}>=[];
  page.on('pageerror',e=>exceptions.push(e.name));
  page.on('response',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/v1/user/'))reads.push({path:u.pathname,status:r.status()});});
  await page.goto('http://127.0.0.1:5173/login',{waitUntil:'domcontentloaded',timeout:20000});
  const reject=page.getByRole('button',{name:'Отклонить'});
  if(await reject.isVisible({timeout:2000}).catch(()=>false))await reject.click();
  await page.locator('#login-name').fill(username,{timeout:20000});
  await page.locator('#login-password').fill(password);
  const logged=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/login',{timeout:25000});
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  const authReply=await logged;
  console.warn('DELETE_PREFLIGHT_BROWSER_REAL_LOGIN_HTTP='+authReply.status());
  ensure(authReply.status()===200,'HONO_LOGIN_NOT_200');
  const identity=await page.evaluate(async()=>{
   for(let n=0;n<12;n++){
    const r=await fetch('/api/v1/auth/me',{credentials:'include'}),j=await r.json();
    if(r.ok)return{status:r.status,userId:j?.data?.id};
    await new Promise(resolve=>setTimeout(resolve,170));
   }
   return{status:401,userId:null};
  });
  if(identity.status!==200||identity.userId!==owner.id)console.warn('DELETE_PREFLIGHT_BROWSER_IDENTITY_HTTP='+identity.status);
  ensure(identity.status===200 && identity.userId===owner.id,'REAL_BROWSER_COOKIE_AUTH');pass('HONO_REAL_LOGIN');
  await page.goto('http://127.0.0.1:5173/profile/delete-account',{waitUntil:'domcontentloaded',timeout:20000});
  await page.getByRole('button',{name:'Отправить код на email'}).waitFor({state:'visible',timeout:22000});
  ensure(reads.some(r=>r.path==='/api/v1/user/account/deletion-preflight'&&r.status===200),'REAL_PREFLIGHT_200');
  ensure(!reads.some(r=>r.path==='/api/v1/user/profile'),'NO_MEDIA_DEPENDENCY');
  const data=await page.evaluate(async()=>{const r=await fetch('/api/v1/user/account/deletion-preflight',{credentials:'include'});const j=await r.json();return{status:r.status,data:j.data};});
  ensure(data.status===200&&data.data?.id===owner.id&&data.data?.username===username&&data.data?.hasEmail===true&&!('email' in data.data),'OWN_EMAIL_BOOLEAN_NO_PII');
  ensure(exceptions.length===0,'NO_BROWSER_ERRORS');
  pass('VITE_HONO_WORK_PREFLIGHT_200_WITH_PRIVATE_AVATAR');
  pass('FORM_SHOWS_CODE_BUTTON_WITHOUT_ANY_DELETE_POST');
  await context.close();
 } finally {await browser.close();}
}
void main().catch(e=>{process.exitCode=1;console.error('DELETE_PREFLIGHT_BROWSER_FAILURE_'+(e instanceof Error?e.message.slice(0,110):'UNKNOWN'));}).finally(async()=>{
 try{if(ownerId){const row=await prisma.user.findUnique({where:{id:ownerId},select:{username:true}});if(row?.username===username&&username.startsWith('delete_preflight_')){await prisma.user.delete({where:{id:ownerId}});console.warn('DELETE_PREFLIGHT_OWN_SYNTHETIC_ROW_RETIRED=PASS');}}}
 catch(e){process.exitCode=1;console.error('DELETE_PREFLIGHT_OWN_FIXTURE_REVIEW_REQUIRED_'+(e instanceof Error?e.name:'UNKNOWN'));}
 await prisma.$disconnect();
});
