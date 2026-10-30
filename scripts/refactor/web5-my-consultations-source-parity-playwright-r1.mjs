/**
 * Bounded browser visual/behavior check of Vite "Мои консультации".
 * This is an explicit LOCAL synthetic UI fixture, not a true Hono or Next
 * E2E and not pixel-comparable to separately captured Next source fixtures.
 * Uses the permitted running Vite dev server; never writes to the real API.
 */
import {chromium} from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==ROOT)throw Error('WRONG_PROJECT_ROOT');
const OUTPUT=join(ROOT,'.design-verify/web5-my-consultations-source-parity-r1');
if(existsSync(OUTPUT))throw Error('OUTPUT_ALREADY_EXISTS');
const EXEC=join(ROOT,'.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell');
if(!existsSync(EXEC))throw Error('ISOLATED_CHROMIUM_NOT_INSTALLED');
mkdirSync(OUTPUT);
const principal={id:'visualowner',username:'visualowner',role:'USER'};
const slot={startAtUtc:'2026-10-28T06:00:00.000Z',endAtUtc:'2026-10-28T06:45:00.000Z',status:'BOOKED'};
const item=(id,status,extra={})=>({
  id,status,slot,cynologistUserId:'trainer1',
  cynologistDisplayName:'Кинолог Анна',clientUsername:principal.username,
  clientOwnerName:'Тестовый владелец',clientPhone:'PRIVATE_NO_DOM',
  petName:'Рекс',petGender:'MALE',petAge:'3 года',petBreed:'Корги',
  clientProblem:'PRIVATE_PROBLEM_NO_DOM',clientSelfHelpAttempt:'PRIVATE_NO_DOM',
  cancelReason:null,confirmationDeadlineAt:'2026-10-28T05:30:00.000Z',
  createdAt:'2026-10-25T05:00:00.000Z',...extra
});
const bookings=[
 item('cancel-time','CANCELLED_BY_SLA'),
 item('cancel-trainer','CANCELLED_BY_TRAINER',{cancelReason:'Перенос встречи по просьбе специалиста'}),
 item('cancel-user','CANCELLED_BY_USER'),
 item('active-confirmed','CONFIRMED'),
];
const sizes=[{name:'desktop',width:1280,height:800},{name:'mobile',width:390,height:844}];
const browser=await chromium.launch({headless:true,executablePath:EXEC,
 args:['--no-sandbox','--disable-background-networking'],
 env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',
 HOME:join(ROOT,'.local-browser-mcp/.cache/home'),
 XDG_CACHE_HOME:join(ROOT,'.local-browser-mcp/.cache/tmp')}});
let rows=[],errorCount=0,postAttempts=0;
try{
 for(const size of sizes){
   const context=await browser.newContext({viewport:{width:size.width,height:size.height},
     locale:'ru-RU',deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
   const page=await context.newPage();
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/v1/**',async route=>{
     const request=route.request(),url=new URL(request.url());
     if(request.method()!=='GET'){postAttempts++;return route.abort('blockedbyclient');}
     if(url.pathname==='/api/v1/auth/me'){
       return route.fulfill({status:200,contentType:'application/json',
         body:JSON.stringify({success:true,data:principal})});
     }
     if(url.pathname==='/api/v1/consultations/my'){
       return route.fulfill({status:200,contentType:'application/json',
         body:JSON.stringify({success:true,data:{items:bookings,nextCursor:null}})});
     }
     return route.abort('blockedbyclient');
   });
   const response=await page.goto('http://127.0.0.1:5173/consultations/my',
     {waitUntil:'domcontentloaded',timeout:25000});
   await page.locator('.next-my-consultations li').first().waitFor({timeout:18000});
   await page.evaluate(()=>document.fonts.ready);
   const cards=page.locator('.next-my-consultations li');
   const result=await page.evaluate(()=>{
     const root=document.querySelector('.next-my-consultations');
     const list=root?.querySelector('ul');
     const cards=[...root.querySelectorAll('li')];
     return {
       route:location.pathname,cardCount:cards.length,
       hint:root.querySelector('p')?.textContent?.trim(),
       ulClasses:list?.className,
       firstCardText:cards[0]?.innerText,
       firstCardRect:(()=>{const r=cards[0].getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})(),
       firstCardBackground:getComputedStyle(cards[0]).backgroundColor,
       firstCardPadding:getComputedStyle(cards[0]).padding,
       badges:cards.map(c=>({text:c.querySelector('[data-tone]')?.textContent,
         tone:c.querySelector('[data-tone]')?.getAttribute('data-tone'),
         description:c.querySelector('p')?.textContent,
         title:c.querySelector('time')?.parentElement?.textContent,
         badgeBackground:c.querySelector('[data-tone]')?
           getComputedStyle(c.querySelector('[data-tone]')).backgroundColor:null})),
       hasPrivate:root.innerText.includes('PRIVATE_NO_DOM')||
         root.innerText.includes('PRIVATE_PROBLEM_NO_DOM'),
       confirmedCall:!!root.querySelector('a[href="/consultations/call/active-confirmed"]'),
       cancelCount:root.querySelectorAll('button[class*="cancelBtn"]').length,
     };
   });
   const cancel=page.getByRole('button',{name:'Отменить запись'});
   await cancel.click();
   const confirmPresent=await page.getByRole('group',{name:'Подтверждение отмены консультации'}).isVisible();
   const cancelDialog=page.getByRole('button',{name:'Не отменять'});
   await cancelDialog.click();
   const dialogClosed=await page.getByRole('group',{name:'Подтверждение отмены консультации'}).count()===0;
   await page.screenshot({path:join(OUTPUT, `my-${size.name}-vite.png`),fullPage:true});
   rows.push({name:size.name,httpStatus:response?.status(),
     ...result,confirmPresent,dialogClosed,postAttempts,errors});
   if(response?.status()!==200||result.cardCount!==4||result.hasPrivate||!result.confirmedCall||
      !confirmPresent||!dialogClosed||result.cancelCount!==1||errors.length||
      postAttempts!==0||result.badges.map(b=>b.text).join('|')!==
      'Отменена по времени|Отменена кинологом|Отменена вами|Подтверждена'){
     errorCount++;
   }
   await context.close();
 }
}finally{await browser.close();}
writeFileSync(join(OUTPUT,'receipt.json'),JSON.stringify({
 sourceScreenshots:'Retained genuine Next browser images in .design-verify/web5-next-vite-true-work-20261026-webpack-r4/my-bookings-*-next.png',
 note:'New Vite runs are synthetic intercepted browser UI only, not true Next pair or real API/provider E2E.',
 rows,postAttempts,errorCount
},null,2));
console.log(JSON.stringify({rows:rows.map(r=>({name:r.name,httpStatus:r.httpStatus,
 cardCount:r.cardCount,badges:r.badges.map(b=>b.text),firstCardRect:r.firstCardRect,
 background:r.firstCardBackground,confirmPresent:r.confirmPresent,
 dialogClosed:r.dialogClosed,postAttempts:r.postAttempts,errors:r.errors})),errorCount},null,2));
if(errorCount)process.exitCode=1;
