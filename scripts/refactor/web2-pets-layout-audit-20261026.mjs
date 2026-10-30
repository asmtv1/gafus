/** User-requested Playwright audit. Production observed separately without auth;
 * synthetic Vite owner is isolated to this browser context; NO backend writes. */
import { chromium } from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
import { realpathSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root='/Users/asmtv1/Desktop/gafus-refactor';
if(realpathSync(process.cwd())!==root)throw Error('WRONG_GIT_ROOT');
const output=join(root,'.design-verify/web2-pets-layout-audit-20261026');
if(existsSync(output))throw Error('EVIDENCE_ALREADY_EXISTS');
const binary=join(root,'.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell');
if(!realpathSync(binary).startsWith(root+'/'))throw Error('BROWSER_OUTSIDE_ROOT');
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:binary,args:['--no-sandbox']});
const checks=[];const browserErrors=[];const requests=[];
try{
 const ctx=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block',acceptDownloads:false});
 const dog={id:'pet_A',name:'Патриарх',breed:'Золотистый ретривер',type:'DOG',birthDate:'2023-09-20T00:00:00.000Z',weightKg:35,showInProfile:true,_count:{preventionEntries:1,documents:1}};
 const dataByPath={
  '/api/v1/auth/me':{id:'synthetic-owner',username:'visual_owner',role:'USER'},
  '/api/v1/pets':[dog],
  '/api/v1/pets/pet_A':{...dog,notes:'Хороший мальчик :)',neckGirthCm:35,muzzleGirthCm:25,bellyGirthCm:54},
  '/api/v1/pets/pet_A/prevention':[{id:'proc1',type:'VACCINATION',performedAt:'2026-10-01T00:00:00.000Z',productName:'Вакцина',notes:'Календарь',reminderEnabled:false,reminderKind:'AFTER_DAYS',reminderDaysAfter:null,reminderOnDate:null,remindAt:null,reminderTimes:['09:00']}],
  '/api/v1/pets/pet_A/documents':[],
  '/api/v1/pets/pet_A/weight':{currentWeightKg:35,targetWeightKg:32,entries:[{id:'w1',weightKg:33,measuredAt:'2026-09-12T00:00:00.000Z'},{id:'w2',weightKg:35,measuredAt:'2026-10-20T00:00:00.000Z'}]},
 };
 await ctx.route('**/*',async route=>{
  const req=route.request();let u;try{u=new URL(req.url())}catch{return route.abort()};
  if(u.hostname!=='127.0.0.1'||u.port!=='5173')return route.abort();
  if(!u.pathname.startsWith('/api/v1/'))return route.continue();
  requests.push({path:u.pathname,method:req.method()});
  if(req.method()!=='GET')throw Error('SYNTHETIC_WRITE_UNEXPECTED_'+req.method()+'_'+u.pathname);
  if(Object.hasOwn(dataByPath,u.pathname))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:dataByPath[u.pathname]})});
  return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({success:false,error:'SYNTHETIC_FIXTURE_UNAVAILABLE'})});
 });
 const page=await ctx.newPage();
 page.on('pageerror',e=>browserErrors.push(e.message.slice(0,300)));
 for(const v of [{name:'desktop',width:1280,height:800},{name:'mobile',width:390,height:844}]){
  await page.setViewportSize({width:v.width,height:v.height});
  await page.goto('http://127.0.0.1:5173/pets',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:/Развернуть карточку питомца Патриарх/}).waitFor({timeout:18000});
  await page.getByRole('button',{name:/Развернуть карточку питомца Патриарх/}).click();
  await page.getByText('Заметки: Хороший мальчик :)').waitFor({timeout:15000});
  await page.getByRole('heading',{name:'Документы'}).waitFor({timeout:15000});
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(800);
  await page.waitForTimeout(650); // Next card CSS uses 0.3s all-property transitions.
  let geo=await page.evaluate(()=>{
   const rect=s=>{const e=document.querySelector(s); if(!e)return null;const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),display:c.display,font:c.fontSize,color:c.color,background:c.backgroundColor}};
   const d=document.querySelector('[id^="pet-card-details-"]');
   const section=(label)=>[...d.querySelectorAll('section')].find(x=>x.getAttribute('aria-label')===label);
   return {url:location.pathname,viewport:[innerWidth,innerHeight],documentScrollWidth:document.documentElement.scrollWidth,grid:rect('.pet-collection-grid'),card:rect('.pet-collection-card'),hero:rect('[data-next-pet-hero]'),details:rect('.gafus-pet-inline-details'),actions:rect('[data-next-pet-actions]'),prevention:rect('[class*="preventionGroup"]'),vet:rect('[class*="vetShortcut"]'),weight:rect('[class*="weightGroup"]'),documents:rect('[class*="documentsGroup"]'),sectionText:{prevention:section('Записи о процедурах')?.innerText.slice(0,170),weight:section('История веса питомца')?.innerText.slice(0,180),documents:section('Документы питомца')?.innerText.slice(0,130)},texts:[...d.querySelectorAll('h4')].map(x=>x.textContent),brokenImages:[...document.images].filter(img=>!img.complete||img.naturalWidth===0).map(x=>x.src),buttons:[...d.querySelectorAll('button')].map(x=>x.innerText.trim()).filter(Boolean).slice(0,35)};
  });
  const ancestors=await page.evaluate(()=>{const el=document.querySelector('.pet-collection-card'); const result=[]; for(let e=el;e&&result.length<9;e=e.parentElement){let c=getComputedStyle(e),r=e.getBoundingClientRect();result.push({tag:e.tagName,cls:typeof e.className==='string'?e.className.slice(0,90):'',x:Math.round(r.x),w:Math.round(r.width),padding:c.padding,margin:c.margin,display:c.display,maxWidth:c.maxWidth,boxSizing:c.boxSizing});}return result});
  console.log('ANCESTORS',v.name,JSON.stringify(ancestors));
  if(geo.documentScrollWidth>v.width)throw Error('HORIZONTAL_OVERFLOW_'+v.name+'_'+geo.documentScrollWidth);
  if(v.name==='desktop'&&geo.card.w<780)throw Error('EXPANDED_DESKTOP_CARD_NOT_820_'+geo.card.w);
  if(v.name==='mobile'&&geo.card.w<240)throw Error('EXPANDED_MOBILE_CARD_TOO_NARROW_'+geo.card.w);
  if(!geo.actions||!geo.vet||!geo.weight||!geo.prevention||!geo.documents)throw Error('EXPANDED_SECTIONS_MISSING_'+v.name);
  await page.screenshot({path:join(output,'expanded-'+v.name+'.png'),fullPage:true,animations:'disabled'});
  const editCount=await page.getByRole('button',{name:'Изменить данные'}).count();
  const deleteCount=await page.getByRole('button',{name:'Удалить питомца'}).count();
  if(!editCount||!deleteCount)throw Error('OWNER_ACTIONS_MISSING_'+v.name);
  checks.push({...geo,editCount,deleteCount,allReads:true});
 }
 writeFileSync(join(output,'geometry.json'),JSON.stringify({checks,requests,browserErrors},null,2));
 console.log(JSON.stringify({result:'PASS',output,checks:checks.map(x=>({viewport:x.viewport,card:x.card,actions:x.actions,prevention:x.prevention,vet:x.vet,weight:x.weight,documents:x.documents,brokenImages:x.brokenImages,texts:x.texts,buttons:x.buttons,editCount:x.editCount,deleteCount:x.deleteCount})),requestCount:requests.length,browserErrors},null,2));
 await ctx.close();
}finally{await browser.close()}
