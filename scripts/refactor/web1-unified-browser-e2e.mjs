import { randomUUID } from "node:crypto";
/** Browser → real Vite reverse proxy → registered Hono → Core → WORK PG.
 * No interception for /api/v1; never contact anything but loopback. */
import { existsSync, lstatSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
const root='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==root||process.env.GAFUS_WEB1_REAL_BROWSER!=='1')throw Error('WEB1_BROWSER_SCOPE_DENIED');
const lease=root+'/.local-pg-scratch/web1-unified-private.json';
if(!existsSync(lease)||lstatSync(lease).isSymbolicLink())throw Error('WEB1_BROWSER_FIXTURE_MISSING');
const data=JSON.parse(readFileSync(lease,'utf8'));
if(data.users?.length!==2||!data.users.every(u=>u.username==='web1_unified_'+u.id.replaceAll('-','')))
 throw Error('WEB1_BROWSER_FOREIGN_LEASE_DENIED');
const [owner,foreign]=data.users;
const chrome=root+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if(!existsSync(chrome)||!chrome.startsWith(root+'/'))throw Error('WEB1_BROWSER_CHROME_DENIED');
const origin=process.env.GAFUS_WEB1_ALT_VITE_PORT==='5373'?
 'http://127.0.0.1:5373':'http://127.0.0.1:5173';
const browserPort=new URL(origin).port;
const path='/api/v1';
// Keep earlier receipt PNGs immutable when an explicitly named WEB1 rerun
// verifies a changed frontend. Only a bounded, project-local output suffix.
const outputTag=process.env.WEB1_E2E_OUTPUT_TAG??'';
if(outputTag && !/^[a-z0-9-]{1,40}$/.test(outputTag))
 throw Error('WEB1_E2E_OUTPUT_SCOPE_DENIED');
const folder=root+'/.design-verify/web1-unified-real-bg-20261026'+
 (outputTag?'-'+outputTag:'');
if(existsSync(folder)&&lstatSync(folder).isSymbolicLink())
 throw Error('WEB1_E2E_OUTPUT_SYMLINK_DENIED');
mkdirSync(folder,{recursive:true});
let assertions=0;
const test=(truth,msg)=>{if(!truth)throw Error('WEB1_E2E_FAIL '+msg);assertions++;};
const browser=await chromium.launch({headless:true,executablePath:chrome,args:['--no-sandbox','--disable-background-networking','--disable-gpu'],
 env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:root+'/.local-browser-mcp/.cache/home',XDG_CACHE_HOME:root+'/.local-browser-mcp/.cache/tmp'}});
async function open(view,clientIndex=0){
 const context=await browser.newContext({viewport:{width:view.width,height:view.height},locale:'ru-RU',deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
 let requests=[];
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.port!==browserPort)return route.abort();
  if(u.pathname.startsWith(path+'/')){
   requests.push(route.request().method()+' '+u.pathname);
   // Synthetic loopback traffic must not borrow another agent's Redis IP budget.
   // Stable per-job benchmark-net address; no response interception or fake API.
   return route.continue({headers:{...route.request().headers(),
    'x-real-ip':'198.18.'+String(process.pid%250)+'.'+String((view.width%200)+clientIndex*20)}});
  }
  return route.continue(); // Nothing mocked, even for private API.
 });
 const page=await context.newPage();
 page.on('pageerror',e=>console.log('WEB1_PAGE_ERROR',e.message.slice(0,180)));
 await page.goto(origin+'/login',{waitUntil:'domcontentloaded'});
 return {context,page,requests};
}
async function api(page,url,method='GET',body,extra={}){
 return page.evaluate(async ({url,method,body,extra})=>{
  const response=await fetch(url,{method,credentials:'include',cache:'no-store',headers:{
   ...(body?{'content-type':'application/json'}:{}),
   ...(method!=='GET'?{'X-Gafus-Auth-Transport':'cookie'}:{}),...extra,
  },...(body?{body:JSON.stringify(body)}:{})});
  let json;try{json=await response.json();}catch{json=null;}
  return {status:response.status,json};
 },{url,method,body,extra});
}
async function login(page,user){
 const reply=await api(page,path+'/auth/login','POST',{username:user.username,password:user.password});
 test(reply.status===200,'login status '+reply.status);
 const me=await api(page,path+'/auth/me');
 test(me.status===200,'cookie persisted '+me.status);
 test(me.json?.data?.id===user.id,'authenticated identity '+user.username);
}
async function ownerScenario(view){
 const {context,page,requests}=await open(view);
 try{
  const anon=await api(page,path+'/user/profile');
  test(anon.status===401,'unauth profile 401');
  await login(page,owner);
  const before=await api(page,path+'/user/profile');
  test(before.status===200&&before.json?.data?.id===owner.id,'real private profile before mutation');
  await page.goto(origin+'/profile',{waitUntil:'domcontentloaded'});
  await page.getByRole('link',{name:'Редактировать профиль'}).waitFor({timeout:18000});
  // Require the real loaded owner identity, not a cached route-header button.
  // `:has()` is scoped to this section, so checking before its mount would
  // compare the fallback shell instead of the actual completed Next layout.
  await page.locator('[data-next-profile-identity]').waitFor({state:'visible',timeout:16000});
  // Same retained Next 27%-opacity sky asset; Vite previously painted
  // #f6f8f5 instead of original #e6e2d8 behind it. Computed CSS is asserted
  // against the exact source variable, not a relaxed screenshot comparator.
  // Real Vite CSS modules are code-split; a visible React node does not prove
  // its CSS chunk has been applied yet. Require actual computed Next parity
  // on the loaded document, without injecting any style or intercepting API.
  await page.evaluate(async()=>{await document.fonts.ready;});
  try{
    await page.waitForFunction(()=>
      getComputedStyle(document.documentElement).backgroundColor==='rgb(230, 226, 216)',
    null,{timeout:12000});
  }catch{
    console.log('WEB1_ROOT_CSS_NOT_LOADED',view.name,await page.evaluate(()=>({
      computed:getComputedStyle(document.documentElement).backgroundColor,
      rootVariable:getComputedStyle(document.documentElement).getPropertyValue('--app-background-color'),
      matches:document.documentElement.matches('html:root:has(.next-profile-shell)'),
      sheetCount:document.styleSheets.length,
      sourceRules:[...document.styleSheets].flatMap(sheet=>{
        try{return [...sheet.cssRules].filter(rule=>rule.cssText.includes('next-profile-shell')&&
          rule.cssText.includes('background-color')).map(rule=>rule.cssText.slice(0,180));}
        catch{return []}
      }).slice(0,8),
    })));
    throw Error('WEB1_ROOT_CSS_LOADED_STATE_MISMATCH');
  }
  await page.waitForTimeout(150);
  const originalRootColor=await page.evaluate(() =>
    getComputedStyle(document.documentElement).backgroundColor);
  const backgroundDiagnostic=await page.evaluate(()=>({
    matched:document.documentElement.matches('html:has(.next-profile-shell)'),
    hasIdentity:!!document.querySelector('[data-next-profile-identity]'),
    variable:getComputedStyle(document.documentElement)
      .getPropertyValue('--app-background-color').trim(),
  }));
  console.log('WEB1_PROFILE_ROOT_BG',view.name,originalRootColor,JSON.stringify(backgroundDiagnostic));
  test(originalRootColor==='rgb(230, 226, 216)', 'Next source html background on profile');
  await page.screenshot({path:folder+'/baseline-profile-'+view.name+'.png',fullPage:false});
  await page.getByRole('link',{name:'Редактировать профиль'}).click();
  test(new URL(page.url()).pathname==='/profile/editBio',
    'source Next bio edit link performs genuine SPA route navigation');
  const form=page.getByRole('form',{name:'Редактирование профиля'});
  await form.waitFor();
  const city='WEB1 Samara '+view.name;
  const bio='WEB1 real SQL bio '+view.name;
  await form.getByLabel('Город').fill(city);
  await form.getByLabel('О себе').fill(bio);
  await form.getByRole('button',{name:'Сохранить',exact:true}).click();
  await page.getByRole('link',{name:'Редактировать профиль'}).waitFor({timeout:12000});
  test(new URL(page.url()).pathname==='/profile',
    'successful SQL readback returns to source profile route');
  const persisted=await api(page,path+'/user/profile');
  test(persisted.json?.data?.profile?.city===city,'SQL profile city confirmed');
  test(persisted.json?.data?.profile?.about===bio,'SQL bio confirmed');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('link',{name:'Редактировать профиль'}).waitFor();
  test((await page.locator('[data-next-profile-identity]').innerText()).includes(city),'profile UI on reload');
  await page.screenshot({path:folder+'/real-profile-'+view.name+'.png',fullPage:true});
  // Registered Hono GET -> actual Core/isolated SQL, with account-scoped
  // subscription entitlement projection. There are no provider mutations:
  // no fake price, checkout request, credential or active status.
  const premium=await api(page,path+'/app-subscription/status');
  test(premium.status===200&&premium.json?.data?.hasActiveSubscription===false,
    'WORK SQL inactive premium snapshot for synthetic owner');
  await page.goto(origin+'/profile?tab=settings',{waitUntil:'domcontentloaded'});
  const premiumCard=page.locator('[data-next-premium]');
  await premiumCard.getByText('Неактивна',{exact:true}).waitFor({timeout:16000});
  test((await premiumCard.innerText()).includes('Откройте больше возможностей'),
    'source Next inactive premium UI actual Core GET');
  test((await premiumCard.getByRole('button').count())===0 &&
    !(await premiumCard.innerText()).includes('₽'),
    'no checkout button or fabricated price in isolated Refactor');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-next-premium]').getByText('Неактивна',{exact:true})
    .waitFor({timeout:16000});
  test((await api(page,path+'/app-subscription/status')).json?.data?.hasActiveSubscription===false,
    'Core subscription snapshot survives real browser reload');
  // Source visitor ProfileSections: real loaded public profile, native radio
  // keyboard semantics and URL state, without automatically fetching gated
  // moments/questions or signed media from the second synthetic user.
  const publicStart=requests.length;
  await page.goto(origin+'/profile?username='+encodeURIComponent(foreign.username),
    {waitUntil:'domcontentloaded'});
  const visitor=page.getByRole('radiogroup',{
    name:`Разделы профиля @${foreign.username}`});
  await visitor.waitFor({timeout:16000});
  const postsTab=visitor.getByRole('radio',{
    name:`Публикации @${foreign.username}`});
  const questionTab=visitor.getByRole('radio',{
    name:`Вопросы @${foreign.username}`});
  test(await postsTab.getAttribute('aria-checked')==='true',
    'loaded public Next visitor starts on published posts');
  test(await page.locator('#profile-activity').count()===1,
    'public activity has original source hash target');
  await questionTab.click();
  test(new URL(page.url()).searchParams.get('tab')==='questions'&&
    await questionTab.getAttribute('aria-checked')==='true'&&
    await page.locator('#profile-questions').count()===1,
    'public question radio selects URL and Next hash target');
  await questionTab.press('Home');
  test(new URL(page.url()).searchParams.get('tab')===null&&
    await postsTab.getAttribute('aria-checked')==='true',
    'visitor Home key restores original posts tab');
  test(!requests.slice(publicStart).some(req=>
    /\/api\/v1\/(?:feed\/profiles\/|questions\?author=)/.test(req)),
    'gated public activity stays unfetched until explicit action');
  console.log('WEB1_REAL_PUBLIC_VISITOR_TABS_PASS',view.name);
  await page.goto(origin+'/reminders',{waitUntil:'domcontentloaded'});
  await page.locator('[data-next-reminders]').waitFor({timeout:16000});
  // Wait for a genuine loaded Vite CSS chunk, not merely the React DOM.
  // Never inject CSS, replace a reference frame, or loosen comparison.
  await page.evaluate(async()=>{await document.fonts.ready;});
  try {
    await page.waitForFunction(() =>
      getComputedStyle(document.documentElement).backgroundColor==='rgb(230, 226, 216)',
      null,{timeout:12000});
  } catch {
    console.log('WEB1_REMINDERS_CSS_NOT_SOURCE', view.name, JSON.stringify(await page.evaluate(()=>({
      color:getComputedStyle(document.documentElement).backgroundColor,
      variable:getComputedStyle(document.documentElement).getPropertyValue('--app-background-color'),
      matched:document.documentElement.matches('html:root:has(.next-reminders-page)'),
      hasAuthBackground:!!document.querySelector('[data-app-background="auth"]'),
      sheets:[...document.styleSheets].map(sheet=>({href:sheet.href,
        matchingRules:(()=>{try{return [...sheet.cssRules].filter(rule=>
          /:root|next-reminders-page/.test(rule.cssText)&&/background/.test(rule.cssText))
          .map(rule=>rule.cssText.slice(0,280));}catch{return []}})()}))
        .filter(sheet=>sheet.matchingRules.length).slice(0,9)
    }))));
    throw Error('WEB1_REMINDERS_CSS_LOADED_STATE_MISMATCH');
  }
  test(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor)
    ==='rgb(230, 226, 216)', 'Next source html background on reminders');
  // The same synthetic owner executes desktop then mobile. A successful
  // desktop idempotency-conflict test intentionally left one separate owned
  // reminder. Read the real list instead of assuming a newly empty account.
  const startingRows=(await api(page,path+'/reminders')).json?.data;
  if(!Array.isArray(startingRows)||startingRows.length>=5)
    throw Error('WEB1_E2E_OWNER_REMINDER_COUNT_UNEXPECTED');
  const createOrdinal=startingRows.length+1;
  // Source Next empty-state uses a genuine single-click create. Then use the
  // existing Hono-backed edit form to set a nondefault timezone and name.
  // This still proves browser POST -> SQL GET -> browser PUT -> SQL GET;
  // advanced multi-reminder creation retains separate mounted tests.
  await page.getByRole('button',{
    name:`+ Добавить напоминание (${startingRows.length}/5)`,
  }).click();
  const draftName=`задай название ${createOrdinal}`;
  const createdItem=page.locator('li[data-next-reminder-row]').last();
  await createdItem.waitFor({timeout:16000});
  await page.waitForFunction(name=>[...document.querySelectorAll(
    'li[data-next-reminder-row] input[aria-label="Название напоминания"]',
  )].some(input=>input.value===name),draftName,{timeout:16000});
  test(await createdItem.locator('input[aria-label="Название напоминания"]').inputValue()
    ===draftName,'original Next editable row name rendered after POST SQL readback');
  await createdItem.getByRole('button',{name:'Развернуть'}).click();
  await createdItem.getByRole('button',{name:'Изменить'}).click();
  const reminderName='WEB1 Chromium '+view.name;
  const editForm=createdItem.locator('form');
  await editForm.getByLabel('Название',{exact:true}).fill(reminderName);
  await editForm.getByLabel('Время',{exact:true}).fill('13:45');
  await editForm.getByLabel('Часовой пояс',{exact:true}).fill('Europe/Paris');
  test(await editForm.getByLabel('Часовой пояс',{exact:true}).inputValue()==='Europe/Paris',
    'timezone DOM updated');
  await editForm.getByRole('button',{name:'Сохранить изменения'}).click();
  // Vite performs a verified Core SQL PUT -> owner GET before updating its
  // controlled source-style name input. Wait for that ACK/readback rather
  // than racing an unrelated second GET immediately after the click.
  await page.waitForFunction(name=>[...document.querySelectorAll(
    'li[data-next-reminder-row] input[aria-label="Название напоминания"]',
  )].some(input=>input.value===name),reminderName,{timeout:16000});
  const list=await api(page,path+'/reminders');
  const row=list.json?.data?.find(x=>x.name===reminderName);
  test(list.status===200&&!!row,'POST committed, GET owner list readback');
  const item=page.locator('li[data-next-reminder-row][data-reminder-id="'+row.id+'"]');
  await item.waitFor({timeout:16000});
  console.log('WEB1_REMINDER_WIRE',view.name,JSON.stringify({reminderTime:row.reminderTime,timezone:row.timezone,enabled:row.enabled}));
  test(row.reminderTime==='13:45'&&row.timezone==='Europe/Paris','reminder fields persisted');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(({id,name})=>{
    const input=document.querySelector(
      'li[data-reminder-id="'+id+'"] input[aria-label="Название напоминания"]');
    return input?.value===name;
  },{id:row.id,name:reminderName},{timeout:12000});
  test(true,'reminder loaded after hard reload');
  await page.screenshot({path:folder+'/real-reminders-'+view.name+'.png',fullPage:true});
  const edited=page.locator('li[data-next-reminder-row][data-reminder-id="'+row.id+'"]');
  await edited.getByRole('button',{name:'Развернуть'}).click();
  await edited.getByRole('button',{name:'Изменить'}).click();
  await edited.locator('form').getByLabel('Время',{exact:true}).fill('18:20');
  await edited.getByRole('button',{name:'Сохранить изменения'}).click();
  await edited.getByText('18:20',{exact:true}).first().waitFor({timeout:15000});
  test((await api(page,path+'/reminders')).json?.data?.find(x=>x.id===row.id)?.reminderTime==='18:20',
    'PUT SQL readback');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('li[data-reminder-id="'+row.id+'"]')
    .getByText('18:20',{exact:true}).waitFor({timeout:12000});
  test(true,'PUT visible after reload');
  // A browser-issued write with a reused operation key and different payload
  // must return explicit 409, not silently add a second reminder.
  const key=randomUUID();
  const first=await api(page,path+'/reminders','POST',{
   name:'WEB1 conflict '+view.name,reminderTime:'08:10',timezone:'Etc/UTC'},
   {'Idempotency-Key':key});
  test(first.status===200,'idempotent initial POST');
  const conflict=await api(page,path+'/reminders','POST',{
   name:'WEB1 conflict changed '+view.name,reminderTime:'08:10',timezone:'Etc/UTC'},
   {'Idempotency-Key':key});
  test(conflict.status===409,'real idempotency conflict 409');
  const foreignSession=await open(view,1);
  try{
   await login(foreignSession.page,foreign);
   const other=await api(foreignSession.page,path+'/reminders');
   test(other.status===200&&!other.json?.data?.some(x=>x.id===row.id),'foreign cannot read owner');
   const forbidden=await api(foreignSession.page,path+'/reminders/'+row.id,'PUT',{enabled:false});
   test(forbidden.status===404,'foreign cannot mutate owner 404');
   const forbiddenDelete=await api(foreignSession.page,path+'/reminders/'+row.id,'DELETE');
   test(forbiddenDelete.status===404,'foreign cannot delete owner 404');
   const authB=await api(foreignSession.page,path+'/auth/me');
   test(authB.json?.data?.id===foreign.id,'B cookie isolation');
  }finally{await foreignSession.context.close();}
  const otherUrl=new URL(origin);
  const ownerCookies=await context.cookies();
  console.log('WEB1_OWNER_COOKIE_NAMES',ownerCookies.map(x=>x.name).join(','));
  const cookieHeader=ownerCookies.filter(item=>item.name.startsWith('gafus_'))
    .map(item=>item.name+'='+item.value).join('; ');
  test(cookieHeader.includes('gafus_access='),'private owner cookie supplied in signed APIRequest');
  const forged=await context.request.post(otherUrl.origin+path+'/reminders/'+row.id,{headers:{
   Cookie:cookieHeader,
   'content-type':'application/json','X-Gafus-Auth-Transport':'cookie',Origin:'https://evil.example',
   'X-Real-IP':'198.18.'+String(process.pid%250)+'.'+String(view.width%200),
  },data:{enabled:false}});
  console.log('WEB1_FORGED_ORIGIN_HTTP',forged.status());
  test(forged.status()===403,'untrusted Origin blocked by Hono');
  const toDelete=page.locator('li[data-next-reminder-row][data-reminder-id="'+row.id+'"]');
  await toDelete.waitFor({timeout:16000});
  await toDelete.getByRole('button',{name:'Удалить',exact:true}).click();
  await toDelete.getByRole('button',{name:'Да, удалить'}).click();
  await toDelete.waitFor({state:'hidden',timeout:15000});
  test(!(await api(page,path+'/reminders')).json?.data?.some(x=>x.id===row.id),'DELETE SQL readback');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('li[data-reminder-id="'+row.id+'"]').waitFor({state:'hidden'});
  test(true,'DELETE still absent on reload');
  test(requests.some(x=>x==='PUT '+path+'/user/profile')&&
    requests.some(x=>x==='POST '+path+'/reminders')&&
    requests.some(x=>x==='DELETE '+path+'/reminders/'+row.id),'real API requests observed');
  console.log('WEB1_E2E_VIEWPORT_PASS',view.name,'requests',requests.length);
 }finally{await context.close();}
}
try{
 for(const view of [{name:'desktop',width:1280,height:800},{name:'mobile',width:390,height:844}])
  await ownerScenario(view);
 console.log('WEB1_UNIFIED_HONO_CORE_SQL_BROWSER_PASS assertions='+assertions);
}finally{await browser.close();}
