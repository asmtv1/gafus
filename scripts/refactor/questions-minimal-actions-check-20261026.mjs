/** Actual signed-in Vite question route with synthetic Hono reads only.
 * Production hosts, POST, user data and provider assets are blocked. */
import {chromium} from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==ROOT)throw Error('AUTHORIZED_PROJECT_ROOT_REQUIRED');
const OUT=ROOT+'/.design-verify/questions-minimal-actions-check-20261026-r4';
if(existsSync(OUT))throw Error('OUTPUT_EXISTS_NO_OVERWRITE');
mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({headless:true,
 executablePath:ROOT+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell',
 args:['--no-sandbox','--disable-background-networking','--disable-gpu']});
const owner={id:'owner_A',username:'admin',name:'Автор вопроса',avatarUrl:'/uploads/avatar.webp'};
const answers=[
 {id:'a_useful',body:'Полезный совет для хозяина',author:{id:'other1',name:'Другой хозяин'},
  best:false,deleted:false,hidden:false,liked:false,hearts:5,parentId:null,
  replyToName:null,replyCount:1,photos:[],canEdit:true,canDelete:true},
 {id:'a_new',body:'Новый полезный ответ',author:{id:'other2',name:'Кинолог'},
  best:false,deleted:false,hidden:false,liked:false,hearts:1,parentId:null,
  replyToName:null,replyCount:0,photos:[],canEdit:false,canDelete:false},
];
answers.push({...answers[1], id:'a_child', body:'Вложенный комментарий',
  parentId:'a_useful', replyToName:'Другой хозяин', canEdit:true, canDelete:true});
const question={id:'question-1',title:'Как вы относитесь к натуральному питанию?',
 body:'Чем вы кормите своего хвостика? Планируете ли переход на натуралку или считаете это излишеством?',
 category:'Питание',status:'waiting',answerCount:2,viewCount:114,
 tags:['Натуралка'],createdAt:'2026-10-09T12:00:00.000Z',editedAt:null,
 author:owner,closed:false,canReply:true,canManage:true,canEdit:true,
 blockReason:null,photos:[],bestAnswer:null, nextAnswerPage:null};
const matrix=[];
try {
 for(const v of [{name:'desktop',width:1280,height:800},{name:'mobile',width:390,height:844}]) {
  const context=await browser.newContext({viewport:{width:v.width,height:v.height},
   locale:'ru-RU',deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[],attemptedWrites=[],requests=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.route('**/*',route=>{
   const req=route.request();const u=new URL(req.url());
   if(!['127.0.0.1','localhost'].includes(u.hostname))return route.abort();
   if(u.pathname==='/uploads/avatar.webp')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><circle fill="#b2c086" cx="25" cy="25" r="25"/></svg>'});
   if(u.pathname.startsWith('/api/v1/')){
    if(req.method()!=='GET'){attemptedWrites.push(req.method()+' '+u.pathname);return route.abort();}
    requests.push(u.pathname+u.search);
    let data=null;
    if(u.pathname==='/api/v1/auth/me') data={id:'owner_A',username:'admin',role:'USER'};
    if(u.pathname==='/api/v1/user/onboarding-tour')data={completed:true};
    if(u.pathname==='/api/v1/questions/question-1') data={...question,
      answers:u.searchParams.get('sort')==='new' ? [...answers].reverse() : answers};
    if(data===null)return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({success:false,error:'Fixture unsupported'})});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
   }
   return route.continue();
  });
  await page.goto('http://127.0.0.1:5173/questions/question-1',{
   waitUntil:'domcontentloaded',timeout:15000});
  await page.locator('.web4-question-primary-card h1').waitFor({state:'visible',timeout:18000});
  await page.locator('.web4-question-answer-composer textarea').waitFor({state:'visible',timeout:18000});
  // Underlying answer commands must not appear as five loud action buttons.
  const toolbar=page.locator('.web4-question-answer-list > li > .web4-answer-actions').first();
  const visual=await toolbar.evaluate(el=>({
    buttons:[...el.querySelectorAll(':scope > button, :scope > .answer-heart > button')].map(b=>b.textContent.trim()),
    summary:!!el.querySelector(':scope > details > summary'),
    menuOpen:el.querySelector('details')?.open,
    menuWidth:el.querySelector('details')?.getBoundingClientRect().width,
    fontSize:getComputedStyle(el).fontSize,
    color:getComputedStyle(el).color,
  }));
  if(visual.menuOpen||!visual.summary||visual.fontSize!=='12px')throw Error('CLOSED_BAR_INVALID '+JSON.stringify(visual));
  await page.screenshot({path:`${OUT}/${v.name}-closed.png`,fullPage:false,animations:'disabled'});
  await toolbar.locator('summary').click();
  await toolbar.locator('details[open]').waitFor();
  const menu=toolbar.locator('.web4-answer-more-content');
  const menuVisible=await menu.isVisible();
  const itemColors=await menu.evaluate(el=>[...el.querySelectorAll(':scope > div > button, :scope > .answer-owner-controls > button, :scope > .question-report > button')]
    .map(btn=>({label:btn.textContent.trim(),bg:getComputedStyle(btn).backgroundColor,color:getComputedStyle(btn).color})));
  if(itemColors.some(item => !['rgba(0, 0, 0, 0)','rgb(241, 240, 232)'].includes(item.bg)
     || item.color==='rgb(255, 255, 255)' || item.color==='rgb(246, 240, 223)'))
    throw Error('INVISIBLE_OR_LOUD_MENU_STYLE '+JSON.stringify(itemColors));
  if(!menuVisible)throw Error('MENU_NOT_VISIBLE');
  const labels=await menu.locator('button:visible').allTextContents();
  if(!labels.some(x=>x.includes('Выбрать лучший ответ'))||
    !labels.some(x=>x.includes('Редактировать ответ'))||
    !labels.some(x=>x.includes('Удалить ответ'))||
    !labels.some(x=>x.includes('Пожаловаться на ответ')))
    throw Error('MENU_ACTIONS_MISSING '+JSON.stringify(labels));
  await page.screenshot({path:`${OUT}/${v.name}-menu.png`,fullPage:false,animations:'disabled'});
  await menu.getByRole('button',{name:'Редактировать ответ'}).click();
  const editor=menu.getByRole('form',{name:'Редактирование ответа'});
  if(!await editor.isVisible())throw Error('EDITOR_HIDDEN');
  if((await editor.locator('textarea').boundingBox()).width < (v.name==='desktop'?250:170))throw Error('EDITOR_TOO_NARROW');
  await page.screenshot({path:`${OUT}/${v.name}-edit.png`,fullPage:false,animations:'disabled'});
  await editor.getByRole('button',{name:'Отмена'}).click();
  await menu.getByRole('button',{name:'Удалить ответ'}).click();
  const confirm=menu.getByRole('group',{name:'Подтверждение удаления ответа'});
  if(!await confirm.isVisible())throw Error('DELETE_CONFIRM_HIDDEN');
  await confirm.getByRole('button',{name:'Не удалять ответ'}).click();
  await menu.getByRole('button',{name:'Пожаловаться на ответ'}).click();
  const report=menu.getByRole('form',{name:'Жалоба на ответ'});
  if(!await report.isVisible())throw Error('REPORT_HIDDEN');
  await report.getByRole('button',{name:'Отмена'}).click();
  await toolbar.locator('summary').click();
  await page.screenshot({path:`${OUT}/${v.name}.png`,fullPage:false,animations:'disabled'});
  const coords=await page.evaluate(()=>{
   const rectangle=(selector)=>{let el=document.querySelector(selector);if(!el)return null;let r=el.getBoundingClientRect();return{x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)}};
   const h=document.querySelector('.web4-question-primary-card h1');
   return {
    page:rectangle('.web4-question-detail'),card:rectangle('.web4-question-primary-card'),
    heading:rectangle('.web4-question-primary-card h1'),headingPx:getComputedStyle(h).fontSize,
    answers:rectangle('.web4-question-answers'),form:rectangle('.web4-question-answer-composer'),
    textarea:rectangle('.web4-question-answer-composer textarea'),
    authorImg:!!document.querySelector('.web4-question-avatar img'),
    compactBarCount:document.querySelectorAll('.web4-answer-actions').length,
    composerOutsideAnswers:document.querySelector('.web4-question-answer-composer')
      ?.parentElement===document.querySelector('.web4-question-answers')?.parentElement,
    sorting:[...document.querySelectorAll('.web4-question-answer-sort button')].map(el=>({text:el.textContent.trim(),pressed:el.getAttribute('aria-pressed')})),
    overflow:document.documentElement.scrollWidth>innerWidth,
   };
  });
  await page.locator('.web4-question-answer-sort button', {hasText:'Новые'}).click();
  await page.locator('.web4-question-answer-sort button[aria-pressed="true"]').waitFor();
  await page.waitForFunction(()=>document.querySelector('.web4-question-answer-sort button[aria-pressed="true"]')?.textContent.includes('Новые'));
  await page.waitForFunction(()=>document.querySelector('.web4-question-answer-list li p')?.textContent.includes('Новый'));
  const sortChanged=requests.some(s=>s.includes('sort=new'));
  const result={screen:v.name,dimensions:[v.width,v.height],...coords,visual,
    menuLabels:labels,menuVisible,itemColors,sortChanged,attemptedWrites,errors,requests};
  result.pass=coords.headingPx=== (v.name==='desktop'?'34px':'23.4px') && !coords.overflow &&
   coords.authorImg && coords.composerOutsideAnswers && coords.compactBarCount>=2 &&
   menuVisible && coords.sorting.length===2 && sortChanged &&
   coords.textarea.w>=coords.form.w*.86 && attemptedWrites.length===0 && errors.length===0;
  matrix.push(result);await context.close();
 }
}finally{await browser.close();}
writeFileSync(OUT+'/metrics.json',JSON.stringify(matrix,null,2));
console.log(JSON.stringify(matrix));
if(matrix.some(m=>!m.pass))process.exitCode=1;
