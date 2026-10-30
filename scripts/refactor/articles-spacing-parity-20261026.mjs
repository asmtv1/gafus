/** Read-only, isolated browser layout fixture. Never touches prod/DB/S3.
 * Load the real Vite page, intercept only synthetic authenticated GETs and
 * fake public thumbnails. No POST, no external host or unsafe network. */
import { chromium } from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
if (process.cwd()!==ROOT) throw Error('INVALID_PROJECT_ROOT');
const OUT=ROOT+'/.design-verify/articles-spacing-parity-20261026';
if(existsSync(OUT))throw Error('OUTPUT_EXISTS');
mkdirSync(OUT,{recursive:true});
const chrome=ROOT+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser=await chromium.launch({headless:true,executablePath:chrome,
 args:['--no-sandbox','--disable-background-networking','--disable-gpu']});
const titles=['Спрашивать «у вас мальчик или девочка?» - бесполезно!',
 'Лижет - значит любит, или это другое?', 'Собака как комик - проверяет на вас материал!',
 'Трудный подросток - не ваша вина.', 'Вы купили ей игрушки, но она несёт домой палку.',
 'Ваша собака вас не «чувствует». Она вас вычисляет.'];
const articles=titles.map((title,i)=>({id:'test_'+i,slug:'article-'+i,title,
 description:'Описание статьи',visibility:'PAID',hasAccess:false,likeCount:i+5,
 viewCount:120+i,authorUsername:'trainer1',
 logoImg:`uploads/trainers/trainer1/articles/article1/cover${i}.webp`,imageUrls:[]}));
const svg=(i)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300"><rect width="400" height="300" fill="#dbba8e"/><rect x="30" y="20" width="340" height="260" rx="15" fill="#a9bba3"/><circle cx="200" cy="145" r="78" fill="#8a592f"/><text x="200" y="160" font-size="38" text-anchor="middle" fill="white">${i+1}</text></svg>`;
const matrix=[];
try {
 for(const v of [{id:'large',w:1644,h:920,columns:3},
                 {id:'desktop',w:1280,h:800,columns:3},
                 {id:'mobile',w:390,h:844,columns:1}]) {
  const ctx=await browser.newContext({viewport:{width:v.w,height:v.h},deviceScaleFactor:1,
    reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[],blocked=[];
  page.on('pageerror',e=>errors.push(String(e.message).slice(0,250)));
  await page.route('**/*',route=>{
   const request=route.request(),u=new URL(request.url());
   if (u.host==='storage.yandexcloud.net' && /^\/gafus-media\/uploads\/trainers\/trainer1\/articles\/article1\/cover[0-5]\.webp$/.test(u.pathname)) {
     const i=Number(u.pathname.match(/cover(\d)/)?.[1]||0);
     return route.fulfill({status:200,contentType:'image/svg+xml',body:svg(i)});
   }
   if (!['localhost','127.0.0.1'].includes(u.hostname)) {
     blocked.push('external:' + u.hostname);return route.abort();
   }
   if(u.pathname.startsWith('/api/v1/')) {
     if(request.method()!=='GET'){blocked.push(request.method()+' '+u.pathname);return route.abort();}
     let data=null;
     if(u.pathname==='/api/v1/auth/me')data={id:'owner_A',username:'owner_A',role:'USER'};
     if(u.pathname==='/api/v1/articles')data=articles;
     if(u.pathname==='/api/v1/user/onboarding-tour')data={completed:true};
     if(data===null)return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({success:false,error:'Not in fixture'})});
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
   }
   return route.continue();
  });
  await page.goto('http://127.0.0.1:5173/articles',{waitUntil:'domcontentloaded',timeout:15000});
  await page.locator('.article-catalog-card').first().waitFor({timeout:18000});
  await page.locator('.article-catalog-cover-image').first().evaluate(img=>img.decode());
  const info=await page.evaluate(()=>{
   const cards=[...document.querySelectorAll('.article-catalog-card')];
   const rect=e=>{const r=e.getBoundingClientRect();return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)};};
   const frame=document.querySelector('.article-catalog-cover');
   const image=document.querySelector('.article-catalog-cover-image');
   return {cards:cards.length,columns:cards.slice(0,3).filter(c=>Math.abs(c.getBoundingClientRect().top-cards[0].getBoundingClientRect().top)<1).length,
     heading:rect(document.querySelector('h1.next-articles-heading')),
    titleOutsideCatalog:document.querySelector('h1.next-articles-heading')?.nextElementSibling === document.querySelector('section.next-articles-index'),
    section:rect(document.querySelector('section.next-articles-index')),
    grid:rect(document.querySelector('.article-catalog-grid')),firstCard:rect(cards[0]),secondCard:rect(cards[1]),
     cover:rect(frame),image:rect(image),imagePosition:getComputedStyle(image).position,
     fit:getComputedStyle(image).objectFit,natural:[image.naturalWidth,image.naturalHeight],
     readableButton:document.querySelector('.article-catalog-card a[data-gafus-shared-button="primary"]')!==null,
     overflow:document.documentElement.scrollWidth>innerWidth};
  });
  await page.screenshot({path:`${OUT}/${v.id}.png`,fullPage:false,animations:'disabled'});
  const pass=info.columns===v.columns&&info.cards===6&&info.imagePosition==='absolute'&&
   info.fit==='contain'&&info.titleOutsideCatalog&&info.readableButton&&info.natural[0]===400&&
   !info.overflow&&errors.length===0&&!blocked.some(s=>s.startsWith('POST'))&&
   Math.abs(info.cover.w/info.cover.h-16/9)<.02 &&
   Math.abs(info.grid.y-(v.id==='mobile'?158:230))<1;
  matrix.push({viewport:v.id,pass,...info,errors,blocked});
  await ctx.close();
 }
}finally{await browser.close();}
writeFileSync(OUT+'/matrix.json',JSON.stringify(matrix,null,2));
console.log(JSON.stringify(matrix));
if(matrix.some(v=>!v.pass))process.exitCode=1;
