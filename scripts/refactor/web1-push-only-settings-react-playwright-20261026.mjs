/** Real React NotificationStatus in Playwright Chromium with synthetic owner/server.
 * Real Vite modules and SW; fake permission/subscription and Hono responses.
 * Never authenticates a real user, writes a DB row, or contacts push provider. */
import {existsSync,lstatSync} from 'node:fs';
import {chromium} from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
import {createECDH} from 'node:crypto';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==ROOT)throw Error('FORBIDDEN_WORKSPACE');
const binary=ROOT+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if(!existsSync(binary)||lstatSync(binary).isSymbolicLink())throw Error('ISOLATED_BROWSER_UNAVAILABLE');
const origin='http://127.0.0.1:5173';
const ec=createECDH('prime256v1');ec.generateKeys();
const publicKey=ec.getPublicKey().toString('base64url');
const browser=await chromium.launch({headless:true,executablePath:binary,args:['--no-sandbox','--disable-background-networking','--disable-gpu'],
 env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:ROOT+'/.local-browser-mcp/.cache/home',XDG_CACHE_HOME:ROOT+'/.local-browser-mcp/.cache/tmp',
 TMPDIR:ROOT+'/.local-browser-mcp/.cache/tmp'}});
try{
 for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
  const context=await browser.newContext({viewport,locale:'ru-RU',serviceWorkers:'allow',reducedMotion:'reduce'});
  await context.grantPermissions(['notifications'],{origin});
  let active=false;const calls=[];
  await context.route('**/*',async route=>{
   const request=route.request();const url=new URL(request.url());
   if(url.origin!==origin)return route.abort();
   if(url.pathname==='/__push_settings_react_fixture__')return route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="root"></main>
     <script>Object.defineProperty(Notification,'permission',{configurable:true,get:()=> 'granted'});Notification.requestPermission=async()=> 'granted';
     window.__syntheticSub=null;
     PushManager.prototype.getSubscription=async()=>window.__syntheticSub;
     PushManager.prototype.subscribe=async()=>{window.__syntheticSub={endpoint:'https://example.invalid/synthetic-owner-endpoint',
       getKey:(kind)=>new Uint8Array(kind==='p256dh'?[1,2,3]:[4,5,6]).buffer,
       unsubscribe:async()=>{window.__syntheticSub=null;return true}};return window.__syntheticSub;};
     </script>
     <script type="module">
       import React from '/node_modules/.vite/deps/react.js';
       import ReactDOMClient from '/node_modules/.vite/deps/react-dom_client.js';
       const {createRoot}=ReactDOMClient;
       import {LegacyNotificationStatus} from '/src/features/profile/LegacyNotificationStatus.tsx';
       createRoot(document.getElementById('root')).render(React.createElement(LegacyNotificationStatus,{ownerId:'synthetic-owner'}));
     </script></body></html>`});
   if(url.pathname==='/api/v1/user/push-subscription-status'){
     calls.push(request.method()+' '+url.pathname);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:{active}})});
   }
   if(url.pathname==='/api/v1/subscriptions/push/public-key'){
     calls.push(request.method()+' '+url.pathname);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:{publicKey}})});
   }
   if(url.pathname==='/api/v1/subscriptions/push'){
     calls.push(request.method()+' '+url.pathname);
     const data=JSON.parse(request.postData()||'{}');
     if(request.method()==='POST'){
       if(data.endpoint!=='https://example.invalid/synthetic-owner-endpoint')throw Error('WRONG_TEST_SUBSCRIPTION');
       active=true;
     }else if(request.method()==='DELETE'){
       if(data.endpoint!=='https://example.invalid/synthetic-owner-endpoint')throw Error('WRONG_DELETE_ENDPOINT');
       active=false;
     }
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true})});
   }
   if(url.pathname==='/api/v1/subscriptions/push/device-status'){
     calls.push(request.method()+' '+url.pathname);
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:{determined:true,hasThisDeviceSubscription:active}})});
   }
   return route.continue();
  });
  try{
   const page=await context.newPage();const pageErrors=[];
   page.on('pageerror',e=>pageErrors.push(e.message));
   await page.goto(origin+'/__push_settings_react_fixture__',{waitUntil:'domcontentloaded',timeout:15000});
   const add=page.getByRole('button',{name:'Включить уведомления в браузере'});
   try{await add.waitFor({state:'visible',timeout:7000});}catch(error){
     console.log('MOUNT_DEBUG',JSON.stringify({errors:pageErrors,body:(await page.locator('body').innerText()).slice(0,1600),scripts:await page.locator('script').count()}));
     throw error;
   }
   const pre=await page.locator('[data-next-notification-status]').innerText();
   if(!pre.includes('Уведомления')||!pre.includes('Неактивна'))throw Error('REAL_UI_PRE_STATE_WRONG '+pre);
   await add.click();
   await page.getByText('✅ Активна').waitFor({state:'visible',timeout:18000});
   const during=await page.locator('[data-next-notification-status]').innerText();
   const reg=await page.evaluate(async()=>{
      const r=await navigator.serviceWorker.getRegistration('/');
      return r?.active?.scriptURL||null;
   });
   if(!reg?.endsWith('/push-sw.js'))throw Error('UI_DID_NOT_REGISTER_REAL_PUSH_SW '+reg);
   await page.getByText('Подробности уведомлений на этом устройстве').click();
   const disable=page.getByRole('button',{name:'Отключить уведомления на этом устройстве'});
   await disable.waitFor({state:'visible',timeout:8000});
   await disable.click();
   await page.getByText('❌ Неактивна',{exact:true}).first().waitFor({state:'visible',timeout:9000});
   const after=await page.locator('[data-next-notification-status]').innerText();
   const state=await page.evaluate(async()=>({subscribed:!!window.__syntheticSub,regs:(await navigator.serviceWorker.getRegistrations()).length}));
   if(active||state.subscribed||!after.includes('❌ Неактивна'))
     throw Error('OWNER_DEVICE_DISABLE_NOT_CONFIRMED '+JSON.stringify({active,state,after}));
   if(pageErrors.length)throw Error('BROWSER_PAGE_ERRORS '+pageErrors.join(' | '));
   const result={viewport,reactModule:true,initial:pre.slice(0,180),afterConnect:during.slice(0,170),
     afterDisable:after.slice(0,170),swScript:reg,finalDevice:state,
     calls,errors:pageErrors};
   console.log('PLAYWRIGHT_MOUNTED_REACT_PUSH_SETTINGS_PASS',JSON.stringify(result));
  }finally{await context.close();}
 }
}finally{await browser.close()}
