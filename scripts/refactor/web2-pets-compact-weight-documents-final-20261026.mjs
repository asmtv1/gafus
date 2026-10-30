/** User-requested Playwright audit. Production observed separately without auth;
 * synthetic Vite owner is isolated to this browser context; NO backend writes. */
import { chromium } from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
import { realpathSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root='/Users/asmtv1/Desktop/gafus-refactor';
if(realpathSync(process.cwd())!==root)throw Error('WRONG_GIT_ROOT');
const output=join(root,'.design-verify/web2-pets-compact-weight-documents-final-20261026');
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
  '/api/v1/pets/pet_A/documents':[
    {id:'doc_01',petId:'pet_A',ownerId:'synthetic-owner',name:'Ветеринарный паспорт.pdf',
      mimeType:'application/pdf',sizeBytes:728064,createdAt:'2026-10-20T10:00:00.000Z'},
    {id:'doc_02',petId:'pet_A',ownerId:'synthetic-owner',name:'Справка о прививках.jpeg',
      mimeType:'image/jpeg',sizeBytes:4302848,createdAt:'2026-10-19T10:00:00.000Z'},
  ],
  '/api/v1/pets/pet_A/weight':{currentWeightKg:35,targetWeightKg:32,entries:[{id:'w0',petId:'pet_A',weightKg:32.5,measuredAt:'2026-04-03T00:00:00.000Z',createdAt:'2026-04-03T00:01:00.000Z'},
    {id:'w1',petId:'pet_A',weightKg:33,measuredAt:'2026-09-12T00:00:00.000Z',createdAt:'2026-09-12T00:01:00.000Z'},{id:'w2',petId:'pet_A',weightKg:35,measuredAt:'2026-10-20T00:00:00.000Z',createdAt:'2026-10-20T00:01:00.000Z'}]},
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
 page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE_ERROR',m.text().slice(0,550));});
 page.on('requestfailed',q=>console.log('FAILED_REQUEST',q.url().slice(0,280),q.failure()?.errorText));
 page.on('response',r=>{if(r.status()>=400)console.log('HTTP_ERROR',r.status(),r.url().slice(0,280));});
 for(const v of [{name:'desktop',width:1280,height:800},{name:'mobile',width:390,height:844}]){
  await page.setViewportSize({width:v.width,height:v.height});
  await page.goto('http://127.0.0.1:5173/pets',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(2100);
  console.log('DIAG',JSON.stringify({url:page.url(),text:(await page.locator('body').innerText()).slice(0,850),html:(await page.locator('body').innerHTML()).slice(0,500),errors:browserErrors,requests}));
  await page.getByRole('button',{name:/Развернуть карточку питомца Патриарх/}).waitFor({timeout:6000});
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
  if(geo.documentScrollWidth>v.width)throw Error('HORIZONTAL_OVERFLOW_'+v.name+'_'+geo.documentScrollWidth);
  if(v.name==='desktop'&&geo.card.w!==820)throw Error('EXPANDED_DESKTOP_CARD_NOT_820_'+geo.card.w);
  if(v.name==='mobile'&&geo.card.w!==344)throw Error('EXPANDED_MOBILE_CARD_TOO_NARROW_'+geo.card.w);
  if(v.name==='mobile'&&geo.actions?.h>47)throw Error('MOBILE_ACTIONS_NOT_PAIRED_'+geo.actions.h);
  const docPick=page.getByText('+ Добавить документ');
  if(await docPick.count()!==1)throw Error('NEXT_DOC_PICK_CONTROL_MISSING_'+v.name);
  if(await page.getByRole('button',{name:'Загрузить документ'}).count())
    throw Error('PRESELECTION_UPLOAD_BUTTON_SHOULD_BE_HIDDEN_'+v.name);
  if(!geo.actions||!geo.vet||!geo.weight||!geo.prevention||!geo.documents)throw Error('EXPANDED_SECTIONS_MISSING_'+v.name);
  const compact=await page.evaluate(()=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y)};};
    const weightRows=[...document.querySelectorAll('[class*="measurementHistory"] > li')].filter(e=>e.querySelector('button'));
    const docRows=[...document.querySelectorAll('.pet-documents-list > li')];
    const docButtons=docRows.map(e=>[...e.querySelectorAll('button')].map(b=>({name:b.getAttribute('aria-label'),label:b.textContent.trim(),skin:b.getAttribute('data-gafus-shared-button'),rect:rect(b)})));
    const add=[...document.querySelectorAll('.pet-documents-section button')].find(b=>b.textContent.trim()==='+ Добавить документ');
    return {weightRows:weightRows.length,weightButtons:weightRows.map(e=>rect(e.querySelector('button'))),
      docRows:docRows.length,docButtons,docRects:docRows.map(rect),
      addSkin:add?.getAttribute('data-gafus-shared-button'),
      overflow:document.documentElement.scrollWidth-innerWidth};
  });
  if(compact.weightRows!==3 || compact.docRows!==2)throw Error('COMPACT_FIXTURE_ROWS_MISSING_'+v.name+JSON.stringify(compact));
  if(compact.weightButtons.some(b=>b.w>44||b.h>44))throw Error('WEIGHT_DELETE_NOT_ICON_COMPACT_'+v.name+JSON.stringify(compact));
  if(compact.docButtons.some(buttons=>buttons.length!==3||buttons.some(b=>b.rect.w>44||b.rect.h>44)))
    throw Error('DOC_ACTIONS_NOT_ICON_COMPACT_'+v.name+JSON.stringify(compact));
  if(compact.addSkin!=='primary')throw Error('DOC_ADD_SHARED_OLIVE_NOT_REUSED_'+v.name);
  if(compact.overflow>0)throw Error('COMPACT_MOBILE_HORIZ_OVERFLOW_'+v.name+compact.overflow);
  console.log('COMPACT_'+v.name,JSON.stringify(compact));
  await page.screenshot({path:join(output,'expanded-'+v.name+'.png'),fullPage:true,animations:'disabled'});
  // Read-only interaction smoke: chart windows and opt-in forms as in Next.
  const chartPeriods=page.locator('[aria-label="Период графика"]');
  if(await chartPeriods.count()!==1)throw Error('WEIGHT_PERIODS_MISSING_'+v.name);
  await chartPeriods.getByRole('button',{name:'3 месяца'}).click();
  if(await chartPeriods.getByRole('button',{name:'3 месяца'}).getAttribute('aria-pressed')!=='true')
    throw Error('THREE_MONTHS_NOT_PRESSED_'+v.name);
  await chartPeriods.getByRole('button',{name:'Год'}).click();
  if(await chartPeriods.getByRole('button',{name:'Год'}).getAttribute('aria-pressed')!=='true')
    throw Error('YEAR_NOT_PRESSED_'+v.name);
  if(await page.getByRole('button',{name:'Сохранить',exact:true}).count())
    throw Error('WEIGHT_FORM_SHOULD_START_CLOSED_'+v.name);
  await page.getByRole('button',{name:'Записать вес'}).click();
  if(await page.getByRole('button',{name:'Сохранить',exact:true}).count()!==1)
    throw Error('WEIGHT_FORM_NOT_OPENED_'+v.name);
  await page.getByRole('button',{name:'Записать вес'}).click();
  await page.getByRole('button',{name:'Цель',exact:true}).click();
  if(await page.getByRole('button',{name:'Сохранить цель'}).count()!==1)
    throw Error('GOAL_FORM_NOT_OPENED_'+v.name);
  await page.getByRole('button',{name:'Цель',exact:true}).click();
  // Next prevention entries open a modal, not an inline form.
  const prevention=page.locator('section[aria-label="Записи о процедурах"]');
  const addProcedure=prevention.getByRole('button',{name:'Добавить запись'});
  await addProcedure.click();
  const procedureDialog=page.getByRole('dialog',{name:'Добавить запись'});
  await procedureDialog.waitFor({state:'visible',timeout:5000});
  if(await procedureDialog.getByRole('combobox',{name:'Тип процедуры'}).count()!==1)
    throw Error('NEXT_PREVENTION_TYPE_MISSING_'+v.name);
  await procedureDialog.getByRole('combobox',{name:'Тип процедуры'}).press('Escape');
  if(await procedureDialog.count())throw Error('PREVENTION_ESC_NOT_CLOSED_'+v.name);
  await prevention.getByRole('button',{name:'Редактировать'}).click();
  const editProcedure=page.getByRole('dialog',{name:'Редактировать запись'});
  await editProcedure.waitFor({state:'visible',timeout:5000});
  await editProcedure.getByRole('button',{name:'Отмена'}).click();
  if(await editProcedure.count())throw Error('PREVENTION_CANCEL_NOT_CLOSED_'+v.name);
  // The original Next edit/delete owner actions use modal dialogs.
  // These two paths must be non-mutating until a deliberate submit.
  await page.getByRole('button',{name:'Изменить данные'}).click();
  const editDialog=page.getByRole('dialog',{name:'Редактировать питомца'});
  await editDialog.waitFor({state:'visible',timeout:5000});
  if(await editDialog.locator('input[autocomplete="bday"]').inputValue()!=='20.09.2023')
    throw Error('NEXT_MODAL_DOB_FORMAT_MISMATCH_'+v.name);
  if(!await editDialog.locator('input').first().evaluate(e=>e===document.activeElement))
    throw Error('OWNER_EDIT_MODAL_NOT_FOCUSED_'+v.name);
  await editDialog.locator('input').first().press('Escape');
  if(await editDialog.count())throw Error('OWNER_EDIT_ESC_NOT_CLOSED_'+v.name);
  await page.getByRole('button',{name:'Удалить питомца'}).click();
  const deletion=page.getByRole('dialog',{name:/Удалить питомца/});
  await deletion.waitFor({state:'visible',timeout:5000});
  if(await deletion.getByRole('button',{name:'Да, удалить'}).count()!==1)
    throw Error('NEXT_DELETE_CONFIRM_ACTION_MISSING_'+v.name);
  if(await deletion.locator('input').count())
    throw Error('NON_SOURCE_TYPED_NAME_REQUIRED_'+v.name);
  if(!await deletion.getByRole('button',{name:'Да, удалить'}).evaluate(el=>el===document.activeElement))
    throw Error('NEXT_DEFAULT_CONFIRM_FOCUS_MISSING_'+v.name);
  await deletion.getByRole('button',{name:'Отмена'}).focus();
  if(!await deletion.getByRole('button',{name:'Отмена'}).evaluate(el=>el===document.activeElement))
    throw Error('SAFE_CANCEL_NOT_KEYBOARD_FOCUSABLE_'+v.name);
  await deletion.getByRole('button',{name:'Отмена'}).click();
  if(await deletion.count())throw Error('OWNER_DELETE_CANCEL_NOT_CLOSED_'+v.name);
  const fileInput=page.locator('section[aria-label="Документы питомца"] input[type="file"]');
  await fileInput.setInputFiles({name:'Карта.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nreadonly synthetic')});
  const pending=page.locator('section[aria-label="Документы питомца"] input[maxlength="250"]');
  if(await pending.inputValue()!=='Карта')throw Error('PENDING_DOCUMENT_BASENAME_MISSING_'+v.name);
  await pending.fill('Прививочная карта');
  await page.locator('section[aria-label="Документы питомца"]').getByRole('button',{name:'Отмена'}).click();
  if(await pending.count())throw Error('PENDING_DOCUMENT_CANCEL_NOT_CLEARED_'+v.name);
  if(requests.some(x=>x.method!=='GET'))throw Error('SYNTHETIC_WRITE_UNEXPECTED_'+v.name);
  const editCount=await page.getByRole('button',{name:'Изменить данные'}).count();
  const deleteCount=await page.getByRole('button',{name:'Удалить питомца'}).count();
  if(!editCount||!deleteCount)throw Error('OWNER_ACTIONS_MISSING_'+v.name);
  checks.push({...geo,editCount,deleteCount,allReads:true});
 }
 writeFileSync(join(output,'geometry.json'),JSON.stringify({checks,requests,browserErrors},null,2));
 console.log(JSON.stringify({result:'PASS',output,checks:checks.map(x=>({viewport:x.viewport,card:x.card,actions:x.actions,prevention:x.prevention,vet:x.vet,weight:x.weight,documents:x.documents,brokenImages:x.brokenImages,texts:x.texts,buttons:x.buttons,editCount:x.editCount,deleteCount:x.deleteCount})),requestCount:requests.length,browserErrors},null,2));
 await ctx.close();
}finally{await browser.close()}
