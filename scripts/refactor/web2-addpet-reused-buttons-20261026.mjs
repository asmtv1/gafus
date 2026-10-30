/** Owner-GET-only browser check for actual /profile/addPet shared CTA inheritance. */
import { chromium } from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
import { existsSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root='/Users/asmtv1/Desktop/gafus-refactor';
if(realpathSync(process.cwd())!==root)throw Error('WRONG_PROJECT_ROOT');
const binary=join(root,'.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell');
if(!existsSync(binary)||!realpathSync(binary).startsWith(root+'/'))throw Error('BROWSER_SCOPE');
const output=join(root,'.design-verify/web2-addpet-reused-shared-buttons-20261026');
if(existsSync(output))throw Error('EXISTING_EVIDENCE');
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:binary,args:['--no-sandbox']});
const errors=[],requests=[],results=[];
try{
 const ctx=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block',acceptDownloads:false});
 await ctx.route('**/*', async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.hostname!=='127.0.0.1'||u.port!=='5173')return route.abort();
  if(!u.pathname.startsWith('/api/v1/'))return route.continue();
  requests.push({path:u.pathname,method:req.method()});
  if(req.method()!=='GET')throw Error('UNEXPECTED_API_WRITE');
  const data=u.pathname==='/api/v1/auth/me'?{id:'synthetic-owner',username:'pet_owner',role:'USER'}:
    u.pathname==='/api/v1/user/onboarding-tour'?{completed:true,currentStep:0}:null;
  if(data===null)return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({success:false,error:'NO_FIXTURE'})});
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
 });
 const page=await ctx.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 for(const v of [{name:'desktop',width:1280,height:800},{name:'mobile',width:390,height:844}]){
  await page.setViewportSize({width:v.width,height:v.height});
  await page.goto('http://127.0.0.1:5173/profile/addPet',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Добавить питомца'}).waitFor({state:'visible',timeout:18000});
  const result=await page.evaluate(()=>{
   const form=document.querySelector('main form');
   const measure=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {
    label:el.textContent.trim(),shared:el.getAttribute('data-gafus-shared-button'),
    variant:el.getAttribute('data-gafus-variant'),type:el.getAttribute('type'),
    minHeight:s.minHeight,height:Math.round(r.height),width:Math.round(r.width),
    gradient:s.backgroundImage,radius:s.borderRadius,color:s.color,boxShadow:s.boxShadow
   }};
   const buttons=[...form.querySelectorAll('button')];
   return {buttons:buttons.slice(-2).map(measure),viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  const [submit,cancel]=result.buttons;
  if(!submit||!cancel||submit.shared!=='primary'||submit.type!=='submit'||
    !submit.gradient.includes('linear-gradient')||submit.radius!=='18px'||
    cancel.shared!=='secondary'||cancel.variant!=='red'||cancel.type!=='button'||
    !cancel.gradient.includes('linear-gradient')||cancel.radius!=='18px'||
    submit.width!==cancel.width||result.overflow)throw Error('SHARED_BUTTONS_NOT_REUSED_'+v.name+JSON.stringify(result));
  // Safe functional check: empty submission must be rejected locally, no POST.
  await page.locator('main form button[type="submit"]').click();
  await page.locator('#g05-error').waitFor({state:'visible',timeout:5000});
  if(requests.some(x=>x.method!=='GET'))throw Error('SUBMIT_VALIDATION_WRITE');
  await page.screenshot({path:join(output,'addpet-'+v.name+'.png'),fullPage:true,animations:'disabled'});
  results.push({name:v.name,...result});
  console.log('SHARED_ADD_PET_'+v.name,JSON.stringify(result));
 }
 writeFileSync(join(output,'checks.json'),JSON.stringify({results,requests,errors},null,2));
 if(errors.length)throw Error('BROWSER_ERRORS_'+JSON.stringify(errors));
 console.log('PASS_SHARED_BUTTONS_DESKTOP_MOBILE');
}finally{await browser.close()}
