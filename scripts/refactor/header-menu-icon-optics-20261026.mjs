/** Read-only Vite header icon optics. All data synthetic, no external network. */
import { chromium } from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==ROOT) throw Error('WRONG_GIT_ROOT');
const OUT=ROOT+'/.design-verify/header-menu-icon-optics-20261026';
if(existsSync(OUT)) throw Error('OUTPUT_ALREADY_EXISTS');
mkdirSync(OUT,{recursive:true});
const executablePath=ROOT+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if(!existsSync(executablePath)) throw Error('MISSING_LOCAL_CHROMIUM');
const browser=await chromium.launch({headless:true,executablePath,
 args:['--no-sandbox','--disable-background-networking','--disable-gpu']});
const results=[];
try {
 for(const screen of [{id:'desktop',w:1280,h:800},{id:'mobile',w:390,h:844}]){
  const ctx=await browser.newContext({viewport:{width:screen.w,height:screen.h},deviceScaleFactor:1,
    reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await ctx.newPage(),errors=[],badWrites=[],external=[];
  page.on('pageerror',e=>errors.push(String(e.message)));
  await page.route('**/*',route=>{
   const request=route.request(),u=new URL(request.url());
   if(!['127.0.0.1','localhost'].includes(u.hostname)) {
    external.push(u.hostname); return route.abort();
   }
   if(u.pathname.startsWith('/api/v1/')){
    if(request.method()!=='GET') {
     badWrites.push(request.method()+' '+u.pathname);return route.abort();
    }
    let data=null;
    if(u.pathname==='/api/v1/auth/me') data={id:'synthetic_owner',username:'fixture',role:'USER'};
    if(u.pathname==='/api/v1/articles') data=[];
    if(u.pathname==='/api/v1/user/onboarding-tour') data={completed:true};
    return route.fulfill({status:data===null?404:200,contentType:'application/json',
      body:JSON.stringify(data===null?{success:false,error:'Not in fixture'}:{success:true,data})});
   }
   return route.continue();
  });
  await page.goto('http://127.0.0.1:5173/articles',{waitUntil:'domcontentloaded',timeout:15000});
  await page.getByRole('button',{name:'Открыть меню'}).click();
  const nav=page.getByRole('navigation',{name:'Разделы'});
  await nav.locator('img').evaluateAll(imgs=>imgs.forEach(img=>img.loading='eager'));
  await page.waitForFunction(()=>{
   const imgs=[...document.querySelectorAll('nav[aria-label="Разделы"] [data-menu-icon] img')];
   return imgs.length===11&&imgs.every(img=>img.complete&&img.naturalWidth>0);
  },undefined,{timeout:12000});
  const info=await nav.evaluate(nav=>{
   const slots=[...nav.querySelectorAll('[data-menu-icon]')];
   const icons=slots.map(slot=>{
    const img=slot.querySelector('img'),style=getComputedStyle(img);
    const canvas=document.createElement('canvas');
    canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(img,0,0);
    const pixels=c.getImageData(0,0,canvas.width,canvas.height).data;
    let minY=canvas.height,maxY=-1;
    for(let y=0;y<canvas.height;y++){
      for(let x=0;x<canvas.width;x++){
        if(pixels[(y*canvas.width+x)*4+3]>=50){minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
      }
    }
    const height=parseFloat(style.height),width=parseFloat(style.width);
    const factor=style.objectFit==='cover' ? Math.max(width/img.naturalWidth,height/img.naturalHeight)
      : Math.min(width/img.naturalWidth,height/img.naturalHeight);
    return {key:slot.dataset.menuIcon,src:new URL(img.src).pathname,
      natural:[img.naturalWidth,img.naturalHeight],cssSize:[width,height],fit:style.objectFit,
      visibleHeight:+((maxY-minY+1)*factor).toFixed(2),
      slotHeight:slot.getBoundingClientRect().height};
   });
   const first=[...nav.querySelectorAll('a,button')].filter(x=>x.className.includes('menuButton'));
   return {icons,iconCount:icons.length,
     logoutIcon:nav.querySelector('button [data-menu-icon="logout"] img')?.getAttribute('src'),
     menuButtonHeights:first.map(x=>+x.getBoundingClientRect().height.toFixed(1)),
     overflow:document.documentElement.scrollWidth>innerWidth,
     navScrollable:nav.scrollHeight>=nav.clientHeight};
  });
  await page.screenshot({path:`${OUT}/${screen.id}-top.png`,animations:'disabled'});
  await nav.locator('button').last().scrollIntoViewIfNeeded();
  await page.screenshot({path:`${OUT}/${screen.id}-bottom.png`,animations:'disabled'});
  const heights=info.icons.map(i=>i.visibleHeight);
  const pass=info.iconCount===11&&info.logoutIcon==='/images/profile-icons/logout.webp'&&
    info.icons.every(i=>i.visibleHeight>=27.9&&i.visibleHeight<=29.5&&i.slotHeight===34)&&
    Math.max(...heights)-Math.min(...heights)<1.1&&
    info.menuButtonHeights.every(h=>h>=50&&h<=55)&&
    !info.overflow&&!errors.length&&!badWrites.length;
  results.push({viewport:screen.id,pass,...info,errors,badWrites,external});
  await ctx.close();
 }
}finally{await browser.close();}
writeFileSync(OUT+'/matrix.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
if(results.some(r=>!r.pass))process.exitCode=1;
