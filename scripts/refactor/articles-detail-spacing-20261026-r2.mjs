/** Read-only authenticated synthetic article typography check; NO real data/provider/mutation. */
import { chromium } from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==ROOT) throw Error('INVALID_PROJECT_ROOT');
const OUT=ROOT+'/.design-verify/articles-detail-spacing-20261026-r2';
if(existsSync(OUT)) throw Error('OUTPUT_EXISTS');
mkdirSync(OUT,{recursive:true});
const chrome=ROOT+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if(!existsSync(chrome)) throw Error('NO_LOCAL_CHROMIUM');
const browser=await chromium.launch({headless:true,executablePath:chrome,
 args:['--no-sandbox','--disable-background-networking','--disable-gpu']});
const content='## Первый раздел\n\nПервый абзац.\n\nВторой абзац.\n\n### Второй раздел\n\nТретий абзац.';
const article={id:'article-synthetic-1',slug:'spacing-sample',title:'Тест отступов статьи',
 description:'Только безопасный тестовый текст',visibility:'PUBLIC',hasAccess:true,
 likeCount:0,isLiked:false,authorUsername:'trainer',contentType:'TEXT',content,
 imageUrls:[],videoUrl:null,createdAt:'2026-10-01T12:00:00Z'};
const results=[];
try{
 for(const v of [{id:'desktop',w:1280,h:800},{id:'mobile',w:390,h:844}]){
  const ctx=await browser.newContext({viewport:{width:v.w,height:v.h},deviceScaleFactor:1,
   reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await ctx.newPage();const errors=[],unexpected=[];
  page.on('pageerror',e=>errors.push(String(e.message)));
  await page.route('**/*',route=>{
   const r=route.request(),u=new URL(r.url());
   if(!['localhost','127.0.0.1'].includes(u.hostname)) {
    unexpected.push('external:'+u.hostname);return route.abort();
   }
   if(u.pathname.startsWith('/api/v1/')){
    if(u.pathname==='/api/v1/articles/spacing-sample/view' && r.method()==='POST')
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true})});
    if(r.method()!=='GET'){unexpected.push(r.method()+' '+u.pathname);return route.abort();}
    let data=null;
    if(u.pathname==='/api/v1/auth/me')data={id:'owner_A',username:'owner_A',role:'USER'};
    if(u.pathname==='/api/v1/articles/spacing-sample')data=article;
    if(u.pathname==='/api/v1/user/onboarding-tour')data={completed:true};
    return route.fulfill({status:data===null?404:200,contentType:'application/json',
     body:JSON.stringify(data===null?{success:false,error:'Not in fixture'}:{success:true,data})});
   }
   return route.continue();
  });
  await page.goto('http://127.0.0.1:5173/articles/spacing-sample',{waitUntil:'domcontentloaded',timeout:15000});
  await page.locator('.article-body h2').waitFor({timeout:15000});
  const info=await page.evaluate(()=>{
   const rect=e=>{const r=e.getBoundingClientRect();return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)};};
   const body=document.querySelector('.article-body');
   const p=body.querySelector('p'),h2=body.querySelector('h2'),h3=body.querySelector('h3');
   return {title:document.querySelector('article h1')?.textContent,body:rect(body),
     textWhitespace:getComputedStyle(body).whiteSpace,lineHeight:getComputedStyle(body).lineHeight,
     firstHeading:rect(h2),firstHeadingMarginTop:getComputedStyle(h2).marginTop,
     secondHeading:rect(h3),firstParagraph:rect(p),paragraphMarginBottom:getComputedStyle(p).marginBottom,
     paragraphs:body.querySelectorAll('p').length,headingCount:body.querySelectorAll('h2,h3').length,
     prewrapClass:body.classList.contains('article-plain-text'),overflow:document.documentElement.scrollWidth>innerWidth};
  });
  const pass=info.title==='Тест отступов статьи'&&info.textWhitespace==='normal'&&
    info.paragraphs===3&&info.headingCount===2&&!info.prewrapClass&&
    info.paragraphMarginBottom===(v.id==='mobile'?'17.664px':'18.4px')&&!info.overflow&&errors.length===0&&unexpected.length===0;
  await page.screenshot({path:`${OUT}/${v.id}.png`,fullPage:false,animations:'disabled'});
  results.push({viewport:v.id,pass,...info,errors,unexpected});
  await ctx.close();
 }
}finally{await browser.close();}
writeFileSync(OUT+'/matrix.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
if(results.some(r=>!r.pass))process.exitCode=1;
