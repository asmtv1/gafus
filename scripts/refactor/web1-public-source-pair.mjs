/** Real same-WORK-SQL guest public Next SSR versus guest Vite Hono.
 * Strict source-loaded snapshots; no NextAuth session/token construction.
 * Distinct from protected-owner pixel parity, which requires authorization. */
import {existsSync,lstatSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {chromium} from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
const root='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==root||process.env.GAFUS_WEB1_REAL_BROWSER!=='1'||
 process.env.GAFUS_WEB1_ALT_NEXT_PORT!=='4302'||
 process.env.GAFUS_WEB1_ALT_VITE_PORT!=='5373')throw Error('WEB1_PUBLIC_PAIR_SCOPE_DENIED');
const lease=root+'/.local-pg-scratch/web1-unified-private.json';
if(!existsSync(lease)||lstatSync(lease).isSymbolicLink())throw Error('WEB1_PUBLIC_PAIR_LEASE_DENIED');
const data=JSON.parse(readFileSync(lease,'utf8'));
const users=data.users;
if(users?.length!==2||!users.every(user=>user.username===
 'web1_unified_'+user.id.replaceAll('-','')))throw Error('WEB1_PUBLIC_PAIR_IDENTITY_DENIED');
const username=users[1].username;
const safePath='/profile?username='+encodeURIComponent(username);
const chrome=root+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if(!existsSync(chrome)||lstatSync(chrome).isSymbolicLink())throw Error('WEB1_PUBLIC_PAIR_CHROME_DENIED');
const folder=root+'/.design-verify/web1-public-source-next-vite-20261026-r1';
if(existsSync(folder))throw Error('WEB1_PUBLIC_PAIR_OUTPUT_EXISTS');
mkdirSync(folder,{recursive:true});
const require=createRequire(import.meta.url);
const {PNG}=require('pngjs');
const browser=await chromium.launch({headless:true,executablePath:chrome,
 args:['--no-sandbox','--disable-background-networking','--disable-gpu'],
 env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:root+'/.local-browser-mcp/.cache/home',
 XDG_CACHE_HOME:root+'/.local-browser-mcp/.cache/tmp'}});
const screens=[];const errors=[];
async function capture(kind,view){
 const port=kind==='next'?4302:5373;
 const context=await browser.newContext({viewport:{width:view.width,height:view.height},
  deviceScaleFactor:1,locale:'ru-RU',reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.port!==String(port))
    return route.abort();
  return route.continue();
 });
 const page=await context.newPage();let status=0,loaded=false;
 const details={kind,viewport:view.name,width:view.width,height:view.height};
 try{
  const url=`http://127.0.0.1:${port}${safePath}`;
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:150000});
  status=response?.status()??0;
  if(status!==200)throw Error('HTTP_'+status);
  const group=page.getByRole('radiogroup',{name:`Разделы профиля @${username}`});
  await group.waitFor({state:'visible',timeout:65000});
  const sourceRadio=group.getByRole('radio',{name:`Публикации @${username}`});
  await sourceRadio.waitFor({state:'visible',timeout:15000});
  await page.evaluate(async()=>{await document.fonts.ready;});
  await page.waitForFunction(()=>[...document.images].filter(img=>{
    const rect=img.getBoundingClientRect();return rect.bottom>0&&rect.top<innerHeight;
  }).every(img=>img.complete),{},{timeout:17000});
  const computed=await page.evaluate(()=>{
    const group=document.querySelector('[role="radiogroup"]');
    const radio=group?.querySelector('[role="radio"]');
    if(!group||!radio)return null;
    const rect=group.getBoundingClientRect();
    return {visible:getComputedStyle(group).display!=='none',
      group:{x:Math.round(rect.x),y:Math.round(rect.y),w:Math.round(rect.width),h:Math.round(rect.height)},
      fontSize:getComputedStyle(radio).fontSize,
      checked:radio.getAttribute('aria-checked'),
      title:document.title,
      bodyText:document.body.innerText.slice(0,2000),
      bodyScrollHeight:document.body.scrollHeight};
  });
  if(!computed?.visible||computed.checked!=='true')throw Error('SOURCE_DOM_NOT_READY');
  const file=`${folder}/public-${kind}-${view.name}.png`;
  await page.screenshot({path:file,fullPage:false});
  loaded=true;
  const record={...details,status,loaded,computed,file};
  screens.push(record);
  console.log('WEB1_PUBLIC_GUEST_LOADED',kind,view.name,status,
    JSON.stringify({group:computed.group,fontSize:computed.fontSize}));
  writeFileSync(`${folder}/matrix.json`,JSON.stringify({screens,errors},null,2));
  return record;
 }catch(e){
  const err={...details,status,loaded:false,reason:e instanceof Error?e.message:String(e)};
  errors.push(err);screens.push(err);
  writeFileSync(`${folder}/matrix.json`,JSON.stringify({screens,errors},null,2));
  console.log('WEB1_PUBLIC_GUEST_NOT_LOADED',kind,view.name,status,err.reason);
  return err;
 }finally{await context.close();}
}
try{
 for(const view of [{name:'desktop',width:1280,height:800},{name:'mobile',width:390,height:844}]){
  const next=await capture('next',view);
  const vite=await capture('vite',view);
  if(next.loaded&&vite.loaded){
   const a=PNG.sync.read(readFileSync(next.file));
   const b=PNG.sync.read(readFileSync(vite.file));
   if(a.width!==b.width||a.height!==b.height)throw Error('WEB1_PUBLIC_PAIR_DIMENSION_MISMATCH');
   let different=0;
   for(let i=0;i<a.data.length;i+=4){
    if(a.data[i]!==b.data[i]||a.data[i+1]!==b.data[i+1]||
      a.data[i+2]!==b.data[i+2]||a.data[i+3]!==b.data[i+3])different++;
   }
   const fraction=different/(a.width*a.height);
   const metric={viewport:view.name,pixelDifferentFraction:fraction,
     comparedPixels:a.width*a.height,note:'Exact raw RGBA diagnostic; not official visual comparator'};
   console.log('WEB1_PUBLIC_GUEST_SOURCE_PIXEL_DIAGNOSTIC',JSON.stringify(metric));
   writeFileSync(`${folder}/comparison-${view.name}.json`,JSON.stringify(metric,null,2));
  }
 }
 writeFileSync(`${folder}/matrix.json`,JSON.stringify({screens,errors},null,2));
 if(errors.length)throw Error('WEB1_PUBLIC_SOURCE_NOT_FULLY_LOADED '+errors.length+'/4');
 console.log('WEB1_PUBLIC_ORIGINAL_NEXT_VITE_SOURCE_PAIR_PASS 4/4');
}finally{await browser.close();}
