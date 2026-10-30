/** Real Chromium Vite /questions catalog using isolated owner-scoped GET fixtures.
 * Never contacts production/DB/S3/CDN and never mutates backend state. */
import { chromium } from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==ROOT)throw Error('PROJECT_ROOT_REQUIRED');
const OUT=ROOT+'/.design-verify/shared-select-chevron-web-check-20261026';
if(existsSync(OUT))throw Error('OUTPUT_ALREADY_EXISTS');
mkdirSync(OUT,{recursive:true});
const chromiumBinary=ROOT+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser=await chromium.launch({headless:true,executablePath:chromiumBinary,
 args:['--no-sandbox','--disable-background-networking','--disable-gpu']});
const q={id:'question-1',title:'Как вы относитесь к натуральному питанию?',
 category:'Питание',tags:['Натуралка'],status:'answered',answerCount:2,viewCount:4,
 author:{id:'owner_A',name:'Автор'},createdAt:'2026-10-09T12:00:00.000Z',
 body:'Вопрос о питании',closed:false,bestAnswer:null};
const output=[];
try {
 for (const item of [{name:'desktop',w:1280,h:800},{name:'mobile',w:390,h:844}]) {
  const context=await browser.newContext({viewport:{width:item.w,height:item.h},
   locale:'ru-RU',deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[],queries=[],mutations=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url());
   if(!['127.0.0.1','localhost'].includes(u.hostname))return route.abort();
   if(!u.pathname.startsWith('/api/v1/'))return route.continue();
   if(req.method()!=='GET'){mutations.push(req.method()+' '+u.pathname);return route.abort();}
   let data=null;
   if(u.pathname==='/api/v1/auth/me')data={id:'owner_A',username:'owner_A',role:'USER'};
   if(u.pathname==='/api/v1/user/onboarding-tour')data={completed:true};
   if(u.pathname==='/api/v1/questions'){
     queries.push(u.search);
     data={items:[q],nextPage:null,canPublish:true,blockReason:null};
   }
   if(data===null)return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({success:false,error:'unmocked GET'})});
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await page.goto('http://127.0.0.1:5173/questions',{waitUntil:'domcontentloaded',timeout:16000});
  const cta=page.locator('a[data-gafus-shared-button="primary"][href="/questions/new"]');
  await cta.waitFor({state:'visible',timeout:15000});
  await page.locator('.question-catalog-card').waitFor({state:'visible',timeout:15000});
  const measured=await page.evaluate(()=>{
   const rect=(e)=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)};};
   const card=document.querySelector('.next-question-preview');
   const cta=document.querySelector('a[data-gafus-shared-button="primary"][href="/questions/new"]');
   const options=document.querySelector('.next-questions-options');
   const groups=[...options.querySelectorAll('[role=group]')];
   return {width:innerWidth,box:rect(document.querySelector('.next-questions-page')),
     card:rect(card),title:rect(document.querySelector('.next-questions-page h1')),
     heading:rect(document.querySelector('[class*=questionsHeading]')),
     subtitle:rect(document.querySelector('[class*=questionsHeading] [class*=subtitle]')),
     filters:rect(document.querySelector('.question-controls')),
     toolbar:rect(document.querySelector('[class*=questionTools]')),
     headlineSize:getComputedStyle(document.querySelector('.next-questions-page h1')).fontSize,
     cta:rect(cta),ctaBackground:getComputedStyle(cta).backgroundImage,
     ctaLabel:cta.textContent.trim(),ctaIcon:!!cta.querySelector('svg'),
     ctaRadius:getComputedStyle(cta).borderRadius,
     groups:groups.map(g=>({label:g.getAttribute('aria-label'),buttons:[...g.querySelectorAll('button')].map(b=>({text:b.textContent.trim(),active:b.getAttribute('aria-pressed')}))})),
     columns:getComputedStyle(document.querySelector('.question-controls')).gridTemplateColumns,
     cardTitle:getComputedStyle(card.querySelector('h2')).fontSize,
     subtitlePx:getComputedStyle(document.querySelector('[class*=questionsHeading] [class*=subtitle]')).fontSize,
     selectVisuals:[...document.querySelectorAll('#question-category,#question-status')]
       .map(el=>({id:el.id, background:getComputedStyle(el).backgroundImage,
         appearance:getComputedStyle(el).appearance,
         backgroundSize:getComputedStyle(el).backgroundSize,
         backgroundPosition:getComputedStyle(el).backgroundPosition,
         paddingRight:getComputedStyle(el).paddingRight,
         width:el.getBoundingClientRect().width})),
     duplicateUnicodeIcons:document.querySelectorAll('[class*=questionSelectIcon]').length,
     horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
  });
  await page.screenshot({path:`${OUT}/${item.name}.png`,fullPage:false,animations:'disabled'});
  await page.getByRole('button',{name:'Мои вопросы'}).click();
  await page.getByRole('button',{name:'Активные'}).click();
  await page.waitForFunction(()=>document.querySelector('button[aria-label="Мои вопросы"]')?.getAttribute('aria-pressed')==='true');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Сортировка вопросов"] button[aria-pressed="true"]')?.textContent?.includes('Активные'));
  const checkedQueries=[...queries];
  const pass=measured.ctaIcon && measured.ctaLabel.includes('Задать вопрос')&&
   measured.ctaBackground.includes('linear-gradient')&&measured.groups[0]?.label==='Чьи вопросы'&&
   measured.groups[1]?.label==='Сортировка вопросов'&&
   measured.cardTitle===(item.name==='mobile'?'17px':'19px') && !measured.horizontalOverflow &&
   measured.duplicateUnicodeIcons===0 && measured.selectVisuals.length===2 &&
   measured.selectVisuals.every(s=>s.background.includes('SelectChevron.svg') &&
      s.appearance==='none' && s.backgroundSize==='18px 18px' && parseFloat(s.paddingRight)>=39)&&
   checkedQueries.some(x=>x.includes('mine=true'))&&checkedQueries.some(x=>x.includes('sort=active'))&&
   errors.length===0&&mutations.length===0;
  output.push({viewport:item.name,pass,...measured,queries:checkedQueries,errors,mutations});
  await context.close();
 }
}finally{await browser.close();}
writeFileSync(OUT+'/metrics.json',JSON.stringify(output,null,2));
console.log(JSON.stringify(output));
if(output.some(x=>!x.pass))process.exitCode=1;
