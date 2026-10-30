/** Original visitor radio behavior via real Vite→registered Hono→WORK Core/PG.
 * No browser API interception, synthetic identities only, loopback only.
 * Not a substitute for a Next-vs-Vite paired pixel comparator. */
import {existsSync,lstatSync,readFileSync,mkdirSync} from 'node:fs';
import {chromium} from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
const root='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==root||process.env.GAFUS_WEB1_REAL_BROWSER!=='1'||
 process.env.GAFUS_WEB1_ALT_VITE_PORT!=='5373')throw Error('WEB1_PUBLIC_SCOPE_DENIED');
const lease=root+'/.local-pg-scratch/web1-unified-private.json';
if(!existsSync(lease)||lstatSync(lease).isSymbolicLink())throw Error('WEB1_PUBLIC_LEASE_DENIED');
const users=JSON.parse(readFileSync(lease,'utf8')).users;
if(users?.length!==2||!users.every(user=>user.username===
 'web1_unified_'+user.id.replaceAll('-','')))throw Error('WEB1_PUBLIC_IDENTITY_DENIED');
const [owner,foreign]=users;
const chrome=root+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if(!existsSync(chrome))throw Error('WEB1_PUBLIC_CHROMIUM_DENIED');
const withIdentity=process.env.WEB1_PUBLIC_IDENTITY_MODE==='1';
if(!['0','1'].includes(process.env.WEB1_PUBLIC_IDENTITY_MODE??''))
 throw Error('WEB1_PUBLIC_IDENTITY_MODE_DENIED');
const folder=root+(withIdentity?
  '/.design-verify/web1-public-identity-live-20261026-r4':
  '/.design-verify/web1-public-visitor-live-20261026-r6');
if(existsSync(folder))throw Error('WEB1_PUBLIC_OUTPUT_EXISTS_DENIED');
mkdirSync(folder,{recursive:true});
const origin='http://127.0.0.1:5373';
let checks=0;
function test(value,reason){if(!value)throw Error('WEB1_PUBLIC_E2E_FAIL '+reason);checks++;}
const browser=await chromium.launch({headless:true,executablePath:chrome,
 args:['--no-sandbox','--disable-background-networking','--disable-gpu'],
 env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:root+'/.local-browser-mcp/.cache/home',
 XDG_CACHE_HOME:root+'/.local-browser-mcp/.cache/tmp'}});
async function run(view){
 const context=await browser.newContext({viewport:{width:view.width,height:view.height},
   locale:'ru-RU',reducedMotion:'reduce',deviceScaleFactor:1,serviceWorkers:'block'});
 const requests=[];
 await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.port!=='5373')
     return route.abort();
   if(url.pathname.startsWith('/api/v1/')){
     requests.push({method:req.method(),path:url.pathname,search:url.search});
     return route.continue({headers:{...req.headers(),
       'x-real-ip':'198.18.'+String(process.pid%250)+'.'+String(view.width%200)}});
   }
   return route.continue();
 });
 try{
  const page=await context.newPage();
  await page.goto(origin+'/login',{waitUntil:'domcontentloaded'});
  const login=await page.evaluate(async ({username,password})=>{
    const response=await fetch('/api/v1/auth/login',{method:'POST',credentials:'include',
      headers:{'content-type':'application/json','X-Gafus-Auth-Transport':'cookie'},
      body:JSON.stringify({username,password})});return response.status;
  },owner);
  test(login===200,view.name+' genuine login');
  const publicPath='/profile?username='+encodeURIComponent(foreign.username);
  await page.goto(origin+publicPath,{waitUntil:'domcontentloaded'});
  const group=page.getByRole('radiogroup',{
    name:`Разделы профиля @${foreign.username}`});
  await group.waitFor({timeout:16000});
  const posts=group.getByRole('radio',{name:`Публикации @${foreign.username}`});
  const questions=group.getByRole('radio',{name:`Вопросы @${foreign.username}`});
  await page.evaluate(async()=>{await document.fonts.ready;});
  const bio=page.locator('[data-next-profile-identity]');
  await bio.waitFor({state:'visible',timeout:16000});
  const pageGeometry=await page.locator('section[aria-label="Публичный профиль"]')
    .evaluate(el=>{
      const css=getComputedStyle(el);
      const list=el.querySelector('section[aria-label="Питомцы"] ul');
      return {paddingTop:css.paddingTop,border:css.borderTopWidth,
        hasLegacyCard:el.classList.contains('profile-overview'),
        hasExtraBack:!!el.querySelector(':scope > p > a'),
        petListPad:list?getComputedStyle(list).paddingLeft:null};
    });
  console.log('WEB1_PUBLIC_SOURCE_PROFILE_WRAPPER',view.name,JSON.stringify(pageGeometry));
  // Original source profile.module.css @max-width 560px sets 9px
  // instead of desktop 18px; this is asserted, never normalized away.
  test(pageGeometry.paddingTop===(view.width<=560?'9px':'18px')&&
    pageGeometry.border==='0px'&&!pageGeometry.hasLegacyCard&&
    !pageGeometry.hasExtraBack,
    view.name+' exact responsive Next public shell, not legacy wrapper');
  if(withIdentity)test(pageGeometry.petListPad==='0px',
    view.name+' retained Next public pet list padding not overridden');
  const sourceBio=await bio.evaluate(el=>({
    display:getComputedStyle(el).display,
    radius:getComputedStyle(el).borderRadius,
    heading:el.querySelector('h1')?.textContent,
    fact:el.querySelector('[aria-label="Личные сведения"]')?.textContent,
    about:el.querySelector('p')?.textContent,
    fallback:!!el.querySelector('img[src="/uploads/avatar.svg"]'),
  }));
  console.log('WEB1_PUBLIC_SOURCE_BIO',view.name,JSON.stringify(sourceBio));
  // Original retained Bio.module.css has 22px desktop / 18px at <=470px.
  test(sourceBio.display==='flex'&&sourceBio.radius===(view.width===390?'18px':'22px'),
    view.name+' source Next Bio loaded card geometry');
  test(sourceBio.heading==='WEB1 Собаковод Б'&&sourceBio.fact?.includes('Самара'),
    view.name+' real WORK SQL author title and city in Bio');
  test(sourceBio.fallback&&await bio.getByText('Синтетический профиль для изолированного теста').count()===1,
    view.name+' source default avatar and actual public about');
  if(withIdentity){
    const contacts=page.getByRole('navigation',{name:'Контакты специалиста'});
    await contacts.waitFor({state:'visible',timeout:12000});
    const external=contacts.locator('a > svg:last-child');
    test(await external.count()===3,
      view.name+' original three Next external-link MUI SVGs');
    const iconCSS=await external.first().evaluate(node=>({
      width:getComputedStyle(node).width,height:getComputedStyle(node).height,
      path:node.querySelector('path')?.getAttribute('d')??''}));
    test(iconCSS.width==='15px'&&iconCSS.height==='15px'&&
      iconCSS.path.startsWith('M18 19H6c-.55'),
      view.name+' real loaded retained MUI icon path/geometry');
    test(await contacts.locator('a[href="https://example.test/profile"]').count()===1&&
      await contacts.locator('a[href="https://t.me/web1_synth_trainer"]').count()===1&&
      await contacts.locator('a[href="https://www.instagram.com/web1_synth_trainer/"]').count()===1,
      view.name+' exact safe public contact links without external navigation');
    const pets=page.locator('section[aria-label="Питомцы"]');
    const diploma=page.locator('section[aria-label="Дипломы пользователя"]');
    await pets.waitFor({state:'visible',timeout:12000});
    await diploma.waitFor({state:'visible',timeout:12000});
    test(await pets.getByRole('heading',{name:'WEB1 Тестовый кот'}).count()===1,
      view.name+' visible owned synthetic pet');
    test(await pets.getByText('Кошка',{exact:true}).count()===1 &&
      await pets.getByText('Сфинкс',{exact:true}).count()===1,
      view.name+' retained public PetList species and breed');
    test(await pets.locator('img[alt="Питомец WEB1 Тестовый кот"]')
      .getAttribute('src')==='/images/pet-avatar-cat.png',
      view.name+' original cat avatar placeholder');
    test(await diploma.getByText('WEB1 Тестовый диплом').count()===1 &&
      (await bio.innerText()).includes('Кинолог'),
      view.name+' trainer role and public diploma via Core');
    const read=await page.evaluate(async x=>{
      const r=await fetch('/api/v1/user/profile/public?username='+encodeURIComponent(x),
        {credentials:'include',cache:'no-store'});
      return {status:r.status,body:await r.json()};
    },foreign.username);
    const raw=read.body?.data;
    test(read.status===200&&raw?.role==='TRAINER'&&raw?.pets?.length===1&&
      raw?.diplomas?.length===1&&raw?.pets?.[0]?.name==='WEB1 Тестовый кот'&&
      raw?.profile?.telegram==='web1_synth_trainer',
      view.name+' actual registered Hono public projection WORK SQL');
    test(!JSON.stringify(raw).includes('WEB1_HIDDEN_PRIVATE_PET'),
      view.name+' private pet excluded from Core projection');
    test(!JSON.stringify(raw).includes('PRIVATE_MEDICAL_RECORD'),
      view.name+' no vet private data in public profile');
  }
  test(await group.getByRole('radio').count()===2,view.name+' real two radios');
  test(await posts.getAttribute('aria-checked')==='true'&&
    await page.locator('#profile-activity').count()===1,view.name+' activity initially active');
  test(requests.some(r=>r.method==='GET'&&r.path==='/api/v1/user/profile/public'&&
    r.search==='?username='+encodeURIComponent(foreign.username)),
    view.name+' genuine Hono public profile GET');
  const css=await group.evaluate(el=>({display:getComputedStyle(el).display,
    radioFont:getComputedStyle(el.querySelector('[role="radio"]')).fontSize}));
  console.log('WEB1_PUBLIC_REAL_CSS',view.name,JSON.stringify(css));
  test(css.display==='flex'&&css.radioFont===(view.width===390?'12px':'14px'),
    view.name+' real loaded Next visitor CSS');
  await questions.click();
  test(new URL(page.url()).searchParams.get('tab')==='questions'&&
    await questions.getAttribute('aria-checked')==='true'&&
    await page.locator('#profile-questions').count()===1,
    view.name+' clicked questions and source hash-target');
  await page.reload({waitUntil:'domcontentloaded'});
  await group.waitFor({timeout:16000});
  test(await questions.getAttribute('aria-checked')==='true',
    view.name+' questions tab persists after full browser reload');
  if(withIdentity){
    test(await page.getByRole('heading',{name:'WEB1 Тестовый кот'}).count()===1&&
      await page.getByText('WEB1 Тестовый диплом').count()===1,
      view.name+' public pet and diploma persisted after real page reload');
  }
  await questions.press('Home');
  test(new URL(page.url()).searchParams.get('tab')===null&&
    await posts.getAttribute('aria-checked')==='true',
    view.name+' source keyboard Home navigation');
  test(!requests.some(r=>r.path.startsWith('/api/v1/feed/profiles/')||
    r.path==='/api/v1/questions'),
    view.name+' no gated activity read before explicit opt-in');
  // The real browser-auth gate can run an explicit POST refresh before
  // login (and receive a legitimate 401). That is an AUTH-only request, not
  // an activity mutation. Hono logs confirmed exactly login + refresh POST.
  test(requests.every(r=>r.method==='GET'||
    (r.method==='POST'&&['/api/v1/auth/login','/api/v1/auth/refresh']
      .includes(r.path))),
    view.name+' no non-auth data writes');
  await page.screenshot({path:`${folder}/public-${view.name}-vite.png`,fullPage:false});
  console.log('WEB1_PUBLIC_REAL_HONO_VIEW_PASS',view.name);
 }finally{await context.close();}
}
try{
 for(const v of [{name:'desktop',width:1280,height:800},{name:'mobile',width:390,height:844}])
  await run(v);
 console.log('WEB1_PUBLIC_HONO_CORE_SQL_PASS assertions='+checks);
}finally{await browser.close();}
