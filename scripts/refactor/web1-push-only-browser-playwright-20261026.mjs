/** Synthetic, isolated real Playwright Chromium push-only verification.
 * - No real DB, no real subscriber, no provider network, no real push sends.
 * - Vite source and the *real registered* push SW run in Chromium.
 * - A fixture page, not an authenticated account or real Hono result.
 */
import {existsSync,lstatSync} from 'node:fs';
import {chromium} from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
import {createECDH} from 'node:crypto';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==ROOT) throw Error('REFRACTOR_SCOPE_DENIED');
const BIN=ROOT+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if(!existsSync(BIN)||lstatSync(BIN).isSymbolicLink())throw Error('PROJECT_CHROMIUM_UNAVAILABLE');
const origin='http://127.0.0.1:5173';
const key=createECDH('prime256v1');key.generateKeys();
const publicKey=key.getPublicKey().toString('base64url');
const outputs=[];
const browser=await chromium.launch({headless:true,executablePath:BIN,
 args:['--no-sandbox','--disable-background-networking','--disable-gpu'],
 env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:ROOT+'/.local-browser-mcp/.cache/home',
 XDG_CACHE_HOME:ROOT+'/.local-browser-mcp/.cache/tmp',
 TMPDIR:ROOT+'/.local-browser-mcp/.cache/tmp'}});
try{
 for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'allow',locale:'ru-RU',
    reducedMotion:'reduce',acceptDownloads:false});
  await context.grantPermissions(['notifications'],{origin});
  const mockCalls=[];
  await context.route('**/*',async route=>{
    const request=route.request();const url=new URL(request.url());
    if(url.origin!==origin)return route.abort('blockedbyclient');
    if(url.pathname==='/__push_only_browser_fixture__'){
      return route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><title>GAFUS push-only synthetic</title>
      <button id="connect" type="button">Включить уведомления в браузере</button>
      <div role="status" id="status">Неактивна</div>
      <script type="module">
        import {connectBrowserPushOnUserGesture} from '/src/features/profile/browserPushEnrollment.ts';
        document.getElementById('connect').addEventListener('click',async()=>{
          try{const result=await connectBrowserPushOnUserGesture(()=> 'synthetic-owner','synthetic-owner');
            document.getElementById('status').textContent='ACTIVE '+result.endpoint;
          }catch(error){document.getElementById('status').textContent='ERROR '+error.message;}
        });
      </script>`});
    }
    if(url.pathname==='/api/v1/subscriptions/push/public-key'){
      mockCalls.push({method:request.method(),pathname:url.pathname});
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:{publicKey}})});
    }
    if(url.pathname==='/api/v1/subscriptions/push'){
      mockCalls.push({method:request.method(),pathname:url.pathname,body:JSON.parse(request.postData()||'{}')});
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true})});
    }
    if(url.pathname==='/api/v1/subscriptions/push/device-status'){
      mockCalls.push({method:request.method(),pathname:url.pathname,body:JSON.parse(request.postData()||'{}')});
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:{determined:true,hasThisDeviceSubscription:true}})});
    }
    return route.continue();
  });
  try{
   const page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/__push_only_browser_fixture__',{waitUntil:'domcontentloaded',timeout:15000});
   const initial=await page.evaluate(async()=>({
     secure:isSecureContext,permission:Notification.permission,
     serviceWorker:!!navigator.serviceWorker,pushManager:!!window.PushManager,
     registrationCount:(await navigator.serviceWorker.getRegistrations()).length,
   }));
   if(!initial.secure||!initial.serviceWorker||initial.registrationCount!==0)
     throw Error('INITIAL_BROWSER_STATE_BAD '+JSON.stringify(initial));

   // Some macOS Chromium headless shells return Notification.permission=denied
   // despite context.grantPermissions. An explicit fake isolates the UI flow:
   // this is NOT proof of real OS permission or OS notification display.
   if(initial.permission!=='granted'){
     await page.evaluate(()=>{
       Object.defineProperty(Notification,'permission',{configurable:true,get:()=> 'granted'});
       Notification.requestPermission=async()=> 'granted';
     });
   }

   // Limit the reach of test: fake only device's PushManager subscription; real
   // application modules, SW registration, browser notification permission and
   // the actual Worker event handlers remain unmodified.
   await page.evaluate(()=>{
     const endpoint='https://example.invalid/synthetic-push-endpoint';
     const sub={endpoint,getKey(name){return new Uint8Array(name==='p256dh'?[1,2,3]:[4,5,6]).buffer;}};
     const originalGet=PushManager.prototype.getSubscription;
     const originalSubscribe=PushManager.prototype.subscribe;
     window.__restoreSyntheticPushManager=()=>{
       PushManager.prototype.getSubscription=originalGet;
       PushManager.prototype.subscribe=originalSubscribe;
     };
     PushManager.prototype.getSubscription=async()=>null;
     PushManager.prototype.subscribe=async()=>sub;
   });
   await page.getByRole('button',{name:'Включить уведомления в браузере'}).click();
   await page.getByRole('status').getByText(/ACTIVE/).waitFor({timeout:18000});
   const registered=await page.evaluate(async()=>{
     const r=await navigator.serviceWorker.getRegistration('/');
     const regs=await navigator.serviceWorker.getRegistrations();
     return {scope:r?.scope,scriptURL:r?.active?.scriptURL,registrations:regs.length,
       control:!!navigator.serviceWorker.controller};
   });
   if(registered.registrations!==1||!registered.scriptURL?.endsWith('/push-sw.js'))
     throw Error('PUSH_ONLY_SW_NOT_ACTIVE '+JSON.stringify(registered));
   const paths=mockCalls.map(x=>x.method+' '+x.pathname);
   if(paths.join('|')!==[
    'GET /api/v1/subscriptions/push/public-key',
    'POST /api/v1/subscriptions/push',
    'POST /api/v1/subscriptions/push/device-status'].join('|'))
     throw Error('OWNER_READBACK_CONTRACT_FAIL '+JSON.stringify(paths));
   if(mockCalls[2]?.body?.endpoints?.[0]!=='https://example.invalid/synthetic-push-endpoint')
     throw Error('INCORRECT_OWNER_READBACK_ENDPOINT');
   const worker=context.serviceWorkers()[0];
   if(!worker)throw Error('REAL_SERVICE_WORKER_WORKER_ABSENT');
   // Deliver the synthetic push *after closing the page*. Chromium retains
   // the registered SW; this still does not involve a real push provider.
   await page.close();
   let dispatch='not attempted';let notices=[];
   try{
     const outcome=await worker.evaluate(async()=>{
       // Mac Chromium headless shell reports denied native Notification.permission.
       // Replace ONLY the OS notification sink inside this isolated test worker;
       // the actual installed push listener and payload parsing run unchanged.
       self.__syntheticNotificationSink=[];
       ServiceWorkerRegistration.prototype.showNotification=async function(title,opts){
         self.__syntheticNotificationSink.push({title,body:opts.body,url:opts.data?.url});
       };
       const payload={title:'Напоминание о тренировке',body:'Тест GAFUS',
         data:{url:'/courses'}};
       if(typeof PushEvent==='undefined')return {status:'NO_PUSH_EVENT_CONSTRUCTOR',sink:[]};
       const event=new PushEvent('push',{data:JSON.stringify(payload)});
       const dispatched=self.dispatchEvent(event);
       await new Promise(resolve=>setTimeout(resolve,200));
       return {status:dispatched?'SYNTHETIC_PUSH_EVENT_DISPATCHED':'SYNTHETIC_PUSH_EVENT_CANCELLED',
         sink:self.__syntheticNotificationSink};
     });
     dispatch=outcome.status;notices=outcome.sink;
   }catch(e){dispatch='SYNTHETIC_DISPATCH_UNSUPPORTED '+String(e.message).slice(0,160);}
   if(notices.length!==1||notices[0]?.title!=='Напоминание о тренировке'||
      notices[0]?.body!=='Тест GAFUS'||notices[0]?.url!==origin+'/courses')
     throw Error('PUSH_ONLY_HANDLER_DID_NOT_PRODUCE_EXPECTED_NOTICE '+JSON.stringify({dispatch,notices}));
   const result={viewport,initial,notificationPermissionShim:initial.permission!=='granted',
    registered,ownerReadbackCalls:paths,syntheticPushEvent:dispatch,notices,pageErrors:errors};
   outputs.push(result);
   console.log('PLAYWRIGHT_PUSH_ONLY_BROWSER',JSON.stringify(result));
   if(errors.length)throw Error('PAGE_JS_ERRORS '+errors.join(' | '));
  }finally{await context.close();}
 }
}finally{await browser.close();}
if(outputs.length!==2||outputs.some(v=>!v.syntheticPushEvent.startsWith('SYNTHETIC_PUSH_EVENT_DISPATCHED')))
 process.exitCode=2;
