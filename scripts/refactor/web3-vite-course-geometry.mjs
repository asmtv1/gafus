/** WEB-3 Vite geometry 1280×800 / 390×844, guest synthetic-no-remote. */
import { mkdirSync,writeFileSync } from 'node:fs';
import { chromium } from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==ROOT)throw Error('WEB3_WRONG_CWD');
const out=ROOT+'/.design-verify/web3-course-geometry-after-20261026';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 executablePath:ROOT+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell',
 args:['--no-sandbox','--disable-gpu','--disable-background-networking'],
 env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:ROOT+'/.local-browser-mcp/.cache/home',XDG_CACHE_HOME:ROOT+'/.local-browser-mcp/.cache/tmp'}});
const matrix=[];
try{
 for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
  const ctx=await browser.newContext({viewport,reducedMotion:'reduce',locale:'ru-RU',deviceScaleFactor:1,serviceWorkers:'block'});
  await ctx.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.hostname!=='127.0.0.1'||u.port!=='5173')return route.abort();
   if(u.pathname==='/api/v1/public/courses')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:[{
    id:'web3-synthetic-course',name:'WEB3 Синтетический курс: команды',type:'WEB3_SYNTHETIC',shortDesc:'Публичный тест оформления',duration:'7 дней',isPaid:false,isPrivate:false,
    hasAccess:true,isFavorite:false,userStatus:'NOT_STARTED',trainingLevel:'BEGINNER'}]})});
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({success:false,code:'GUEST_ONLY'})});
   return route.continue();
  });
  const page=await ctx.newPage();
  const resp=await page.goto('http://127.0.0.1:5173/courses',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(900);
  const main=page.locator('main.shell'),catalog=page.locator('.gafus-next-courses');
  const row={viewport,status:resp?.status(),main:await main.boundingBox(),catalog:await catalog.boundingBox(),
   heading:(await page.locator('h1,h2').allTextContents()).map(s=>s.trim()).slice(0,5)};
  await page.screenshot({path:`${out}/courses-${viewport.width}.png`,fullPage:false,animations:'disabled'});
  matrix.push(row);console.log('WEB3_COURSE_GEOMETRY',JSON.stringify(row));
  await ctx.close();
 }
}finally{await browser.close()}
writeFileSync(`${out}/metrics.json`,JSON.stringify(matrix,null,2));
if(matrix.length!==2||matrix[0].status!==200||matrix[1].status!==200||
 matrix[0].main?.x!==0||matrix[0].main?.width!==1280||
 matrix[1].main?.width!==390)throw Error('WEB3_GEOMETRY_REGRESSION');
console.log('WEB3_COURSES_MAIN_WIDTHS_PASS');
