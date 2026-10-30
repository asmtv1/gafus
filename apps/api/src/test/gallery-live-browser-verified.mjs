/** Disposable real HTTP -> Hono -> WORK SQL + loaded Vite browser Gallery smoke.
 * No real users, no production, no Cloud.ru. Only own synthetic album/user.
 */
import { randomBytes } from 'node:crypto';
import { realpathSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { prisma } from '@gafus/prisma';
import { chromium } from '../../../../.local-browser-mcp/node_modules/playwright/index.mjs';
const root='/Users/asmtv1/Desktop/gafus-refactor';
const api='http://127.0.0.1:3601/api/v1';
const web='http://127.0.0.1:5173';
const pagePath='/profile/albums';
const username='gallery_live_ui_'+randomBytes(6).toString('hex');
const password='GallerySmokeA1_'+randomBytes(18).toString('base64url');
let user,albumId,browser,diagnosticPage; const requestResults=[];
let phase='setup';
function assert(value,message){if(!value)throw Error('LIVE_GALLERY_'+message);}
async function json(url,init={}){
 const response=await fetch(url,{...init,signal:AbortSignal.timeout(15000)});
 let parsed={};try{parsed=await response.json()}catch{}
 return {status:response.status,body:parsed};
}
const headers=(token,extra={})=>({...extra,Authorization:`Bearer ${token}`});
try{
 assert(realpathSync(root)===root && realpathSync(process.cwd())===root+'/apps/api','PROJECT_ROOT');
 assert(execFileSync('git',['-C',root,'rev-parse','--show-toplevel'],{encoding:'utf8'}).trim()===root,'GIT_ROOT');
 assert(execFileSync('git',['-C',root,'branch','--show-current'],{encoding:'utf8'}).trim()==='vite','BRANCH');
 const database=new URL(process.env.DATABASE_URL??'');
 assert(database.hostname==='127.0.0.1' && database.port==='55921' &&
 database.pathname==='/gafus_refactor_real_work_20261024' &&
 database.username==='gafus_refactor_local_real','WORK_DB_ONLY');
 phase='own_new_actor';
 user=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),role:'USER',passwordSetAt:new Date(),registrationPending:false}});
 phase='real_login';
 const login=await json(api+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
 const token=login.body?.data?.accessToken;
 assert(login.status===200&&typeof token==='string','REAL_LOGIN');
 phase='gallery_enabled_exact';
 const direct=await json(api+'/gallery/profiles/'+username+'/albums?pageSize=20',{headers:headers(token)});
 assert(direct.status===200&&direct.body?.success===true&&direct.body?.data?.enabled===true,'REAL_HONO_GALLERY_ENABLED');
 console.log('GALLERY_LIVE_DIRECT_HONO_OWNER_READ_ENABLED=PASS');
 phase='vite_gallery_proxy';
 const proxied=await json(web+'/api/v1/gallery/profiles/'+username+'/albums?pageSize=20',{headers:headers(token)});
 assert(proxied.status===200&&proxied.body?.success===true&&proxied.body?.data?.enabled===true,'VITE_ROUTES_TO_ENABLED_GALLERY');
 console.log('GALLERY_LIVE_VITE_GALLERY_PROXY_ENABLED=PASS');
 phase='sql_create_via_real_http';
 const create=await json(web+'/api/v1/gallery/albums',{method:'POST',headers:headers(token,{'Content-Type':'application/json'}),body:JSON.stringify({name:'Проверка живой галереи',description:'Только локальный тест',isVisible:false})});
 albumId=create.body?.data?.id;
 assert(create.status===200 && typeof albumId==='string' && albumId.length>0,'REAL_VITE_ALBUM_CREATE');
 const stored=await prisma.galleryAlbum.findUnique({where:{id:albumId}});
 assert(stored?.ownerId===user.id && stored?.name==='Проверка живой галереи','WORK_POSTGRES_PERSISTED');
 const refresh=await json(web+'/api/v1/gallery/profiles/'+username+'/albums?pageSize=20',{headers:headers(token)});
 assert(refresh.status===200 && refresh.body?.data?.items?.some(x=>x.id===albumId),'RELOADED_FROM_REAL_SQL');
 console.log('GALLERY_LIVE_CREATE_SQL_AND_API_RELOAD=PASS');
 phase='browser_login';
 const executable=root+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
 assert(existsSync(executable)&&realpathSync(executable).startsWith(root+'/'),'PROJECT_LOCAL_CHROMIUM_ONLY');
 browser=await chromium.launch({headless:true,executablePath:executable,args:['--no-sandbox','--disable-gpu']});
 const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
 const session=await context.request.post(web+'/api/v1/auth/login',{headers:{Origin:web,'X-Gafus-Auth-Transport':'cookie','Content-Type':'application/json'},data:{username,password},timeout:15000});
 assert(session.status()===200,'BROWSER_COOKIE_LOGIN');
 const cookies=await context.cookies(web+'/api/v1/auth/me');
 const cookieHeaders=session.headers()['set-cookie']??'';
 console.log('GALLERY_LIVE_COOKIE_RESPONSE_SET='+String(cookieHeaders.includes('gafus_access=')));
 console.log('GALLERY_LIVE_COOKIE_RESPONSE_SECURE='+String(cookieHeaders.includes('Secure')));
 assert(!cookieHeaders.includes('Secure')&&cookies.some(c=>c.name==='gafus_access'),'BROWSER_AUTH_COOKIE');
 const page=await context.newPage(); diagnosticPage=page;
 page.on('response',res=>{try{const u=new URL(res.url());if(u.hostname==='127.0.0.1'&&requestResults.length<35)requestResults.push([u.pathname,res.status()]);}catch{}});
 const browserMe=await context.request.get(web+'/api/v1/auth/me');
 const browserGallery=await context.request.get(web+'/api/v1/gallery/profiles/'+username+'/albums?pageSize=20');
 console.log('GALLERY_LIVE_BROWSER_AUTH_ME_HTTP='+browserMe.status());
 console.log('GALLERY_LIVE_BROWSER_AUTH_GALLERY_HTTP='+browserGallery.status());
 const galleryRequests=[];
 page.on('response',res=>{if(res.url().includes('/api/v1/gallery/'))galleryRequests.push({status:res.status(),pathname:new URL(res.url()).pathname})});
 phase='loaded_page';
 await page.goto(web+pagePath,{waitUntil:'domcontentloaded',timeout:20000});
 await page.getByRole('button',{name:/Создать альбом/}).waitFor({state:'visible',timeout:19000});
 await page.getByText('Проверка живой галереи',{exact:true}).first().waitFor({state:'visible',timeout:12000});
 assert(!(await page.getByText('Галерея пока недоступна.').count()),'GALLERY_NOT_UNAVAILABLE');
 assert(galleryRequests.some(x=>x.status===200&&x.pathname.endsWith('/'+username+'/albums')),'BROWSER_GALLERY_GET200');
 console.log('GALLERY_LIVE_CHROMIUM_LOADED_OWNER_ALBUMS_AND_CREATE_BUTTON=PASS');
 await page.setViewportSize({width:390,height:844});
 await page.reload({waitUntil:'domcontentloaded',timeout:16000});
 await page.getByText('Проверка живой галереи',{exact:true}).first().waitFor({state:'visible',timeout:14000});
 assert(!(await page.getByText('Галерея пока недоступна.').count()),'MOBILE_GALLERY_NOT_UNAVAILABLE');
 console.log('GALLERY_LIVE_CHROMIUM_MOBILE_390_ENABLED=PASS');
 await context.close();
 phase='delete_own_album';
 const del=await json(web+'/api/v1/gallery/albums/'+albumId,{method:'DELETE',headers:headers(token)});
 assert(del.status===200,'ALBUM_DELETE');
 const gone=await json(web+'/api/v1/gallery/albums/'+albumId,{headers:headers(token)});
 assert(gone.status===404,'ALBUM_DELETED_READBACK');
 console.log('GALLERY_LIVE_DELETE_OWN_ALBUM_AND_404=PASS');
}catch(error){process.exitCode=1;
 if(diagnosticPage){
  try{console.error('GALLERY_LIVE_DIAGNOSTIC_URL_PATH='+new URL(diagnosticPage.url()).pathname);
    const body=(await diagnosticPage.locator('body').innerText({timeout:3000})).replace(/\s+/g,' ').slice(0,1500);
    console.error('GALLERY_LIVE_DIAGNOSTIC_VISIBLE_TEXT='+body);
    console.error('GALLERY_LIVE_DIAGNOSTIC_HTTP='+JSON.stringify(requestResults));
  }catch{console.error('GALLERY_LIVE_DIAGNOSTIC_READ_UNAVAILABLE');}
 }
 console.error('GALLERY_LIVE_SMOKE_FAILED_PHASE='+phase+' CODE='+(error instanceof Error ? error.message.replace(/[^A-Z0-9_]/g,'').slice(0,90):'UNKNOWN'));}
finally{
 try{
  await browser?.close();
  if(user){
   const row=await prisma.user.findUnique({where:{id:user.id},select:{username:true}});
   assert(row?.username===username && username.startsWith('gallery_live_ui_'),'SAFE_FIXTURE_CLEANUP_SCOPE');
   await prisma.user.delete({where:{id:user.id}});
   console.log('GALLERY_LIVE_OWN_SYNTHETIC_WORK_USER_CLEANUP=PASS');
  }
 }catch{process.exitCode=1;console.error('GALLERY_LIVE_CLEANUP_REVIEW_REQUIRED');}
 await prisma.$disconnect();process.exit(process.exitCode??0);
}
