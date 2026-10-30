/** Local-only source-backed prevention dialog visual and read-only interaction audit.
 * No stored tokens, no production access, no HTTP writes, no fixture export.
 */
import { chromium } from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
import { existsSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root='/Users/asmtv1/Desktop/gafus-refactor';
if(realpathSync(process.cwd())!==root)throw Error('WRONG_GIT_ROOT');
const binary=join(root,'.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell');
if(!existsSync(binary)||!realpathSync(binary).startsWith(root+'/'))throw Error('INVALID_BROWSER_SCOPE');
const output=join(root,'.design-verify/web2-prevention-shared-red-cancel-20261026');
if(existsSync(output))throw Error('EXISTING_EVIDENCE');
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:binary,args:['--no-sandbox']});
const checks=[];const errors=[];const reqs=[];
try{
 const ctx=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block',acceptDownloads:false});
 const dog={id:'pet_A',name:'Патриарх',breed:'Золотистый ретривер',type:'DOG',birthDate:'2023-09-20T00:00:00.000Z',weightKg:35,showInProfile:true,_count:{preventionEntries:1,documents:0}};
 const rows={
  '/api/v1/auth/me':{id:'synthetic-owner',username:'visual_owner',role:'USER'},
  '/api/v1/user/onboarding-tour':{completed:true,currentStep:0},
  '/api/v1/pets':[dog],
  '/api/v1/pets/pet_A':{...dog,notes:'Owner-side specimen'},
  '/api/v1/pets/pet_A/prevention':[{id:'proc1',type:'VACCINATION',performedAt:'2026-10-01T00:00:00.000Z',productName:'Вакцина',notes:'Календарь',reminderEnabled:false,reminderKind:'AFTER_DAYS',reminderDaysAfter:null,reminderOnDate:null,remindAt:null,reminderTimes:['09:00']}],
  '/api/v1/pets/pet_A/documents':[],
  '/api/v1/pets/pet_A/weight':{currentWeightKg:35,targetWeightKg:32,entries:[]},
 };
 await ctx.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());
  if(u.hostname!=='127.0.0.1'||u.port!=='5173')return route.abort();
  if(!u.pathname.startsWith('/api/v1/'))return route.continue();
  reqs.push({path:u.pathname,method:request.method()});
  if(request.method()!=='GET')throw Error('MUTATION_FORBIDDEN_'+request.method());
  if(Object.hasOwn(rows,u.pathname))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:rows[u.pathname]})});
  return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({success:false,error:'NO_FIXTURE'})});
 });
 const page=await ctx.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 for(const v of [{name:'desktop',width:1280,height:800},{name:'mobile',width:390,height:844},{name:'short',width:390,height:660}]){
  await page.setViewportSize({width:v.width,height:v.height});
  await page.goto('http://127.0.0.1:5173/pets',{waitUntil:'domcontentloaded'});
  const expand=page.getByRole('button',{name:/Развернуть карточку питомца Патриарх/});
  await expand.waitFor({timeout:18000});
  await expand.click();
  const add=page.getByRole('button',{name:'Добавить запись'});
  await add.waitFor({timeout:12000});
  await add.click();
  const dialog=page.getByRole('dialog',{name:'Добавить запись'});
  await dialog.waitFor({state:'visible',timeout:8000});
  await page.evaluate(()=>document.fonts.ready);
  const before=await dialog.evaluate(el=>{
    const style=getComputedStyle(el),rect=el.getBoundingClientRect();
    const form=el.querySelector('form');
    const panel=el.querySelector('form > div:first-child');
    const footer=el.querySelector('form > div:last-child');
    const r=(e)=>{if(!e)return null;const a=e.getBoundingClientRect();return {x:Math.round(a.x),y:Math.round(a.y),w:Math.round(a.width),h:Math.round(a.height),bottom:Math.round(a.bottom)};};
    const buttons=[...footer.querySelectorAll('button')].map(b=>({label:b.textContent.trim(),kind:b.getAttribute('data-gafus-shared-button'),background:getComputedStyle(b).backgroundImage, variant:b.getAttribute('data-gafus-variant'),color:getComputedStyle(b).color,buttonType:b.type,bounds:r(b)}));
    const label=panel.querySelector('label');
    return {dialog:r(el),paper:style.backgroundImage,maxHeight:style.maxHeight,title:r(el.querySelector('h2')),form:r(form),fields:r(panel),footer:r(footer),buttons,firstLabel:label?.textContent.trim(),labelSize:getComputedStyle(label).fontSize,scroll:panel.scrollHeight,client:panel.clientHeight,overflowX:document.documentElement.scrollWidth-innerWidth,viewport:[innerWidth,innerHeight]};
  });
  const save=before.buttons.find(b=>b.label==='Сохранить');
  const cancel=before.buttons.find(b=>b.label==='Отмена');
  if(!save||!cancel||save.kind!=='primary'||!save.background.includes('linear-gradient')||
    cancel.kind!=='secondary'||cancel.variant!=='red'||!cancel.background.includes('linear-gradient')||cancel.color!=='rgb(255, 255, 255)'||cancel.buttonType!=='button'||
    before.dialog.w>601||before.dialog.w<300||before.dialog.bottom>v.height-5||
    before.footer.bottom>before.dialog.bottom||before.footer.y<before.dialog.y||
    before.fields.bottom>before.footer.y+2||before.overflowX>0)
    throw Error('MODAL_LAYOUT_MISMATCH_'+v.name+'_'+JSON.stringify(before));
  await page.screenshot({path:join(output,'open-'+v.name+'.png'),animations:'disabled'});
  const times=dialog.locator('input[type="time"]');
  if(await times.count()!==1)throw Error('REMINDER_TIME_INPUT_MISSING_'+v.name);
  await dialog.getByRole('button',{name:'Ещё одно напоминание'}).click();
  if(await times.count()!==2)throw Error('ADD_TIME_FAILED_'+v.name);
  await dialog.getByRole('button',{name:'Убрать время 2'}).click();
  if(await times.count()!==1)throw Error('REMOVE_TIME_FAILED_'+v.name);
  const bottom=await dialog.evaluate(el=>{
    const fields=el.querySelector('form > div:first-child');
    const footer=el.querySelector('form > div:last-child');
    fields.scrollTop=fields.scrollHeight;
    const r=footer.getBoundingClientRect();
    return {fieldsScrolled:fields.scrollTop,footerBottom:Math.round(r.bottom),windowH:innerHeight};
  });
  if(bottom.footerBottom>v.height-5)throw Error('FOOTER_LOST_AFTER_SCROLL_'+v.name+JSON.stringify(bottom));
  await dialog.getByRole('button',{name:'Отмена'}).click();
  if(await dialog.count())throw Error('CANCEL_DID_NOT_CLOSE_'+v.name);
  if(reqs.some(x=>x.method!=='GET'))throw Error('HTTP_WRITE_OCCURRED_'+v.name);
  checks.push({name:v.name,layout:before,bottom});
  console.log('NEXT_MODAL_'+v.name,JSON.stringify({before,bottom}));
 }
 writeFileSync(join(output,'checks.json'),JSON.stringify({checks,errors,reqs},null,2));
 if(errors.length)throw Error('JS_BROWSER_ERRORS_'+JSON.stringify(errors));
 console.log('PASS_PREVENTION_DESKTOP_MOBILE_SHORT');
 await ctx.close();
}finally{await browser.close()}
