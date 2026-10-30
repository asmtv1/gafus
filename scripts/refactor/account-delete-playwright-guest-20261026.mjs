import {existsSync,lstatSync} from 'node:fs';
import {chromium} from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
const R='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==R)throw Error('PROJECT_SCOPE_DENIED');
const BIN=R+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if(!existsSync(BIN)||lstatSync(BIN).isSymbolicLink())throw Error('LOCAL_BROWSER_DENIED');
const browser=await chromium.launch({headless:true,executablePath:BIN,args:['--no-sandbox','--disable-background-networking'],env:{PATH:'/usr/bin:/bin:/opt/homebrew/bin',HOME:R+'/.local-browser-mcp/.cache/home',XDG_CACHE_HOME:R+'/.local-browser-mcp/.cache/tmp',TMPDIR:R+'/.local-browser-mcp/.cache/tmp'}});
try{
 const context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:false,serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(!['http://127.0.0.1:5173','http://127.0.0.1:3001'].includes(u.origin))return route.abort('blockedbyclient');
  if(!['GET','HEAD'].includes(route.request().method())&&!(u.pathname==='/api/v1/auth/refresh'&&route.request().method()==='POST'))return route.abort('blockedbyclient');
  return route.continue();
 });
 const p=await context.newPage();
 const network=[];p.on('response',r=>{if(r.url().includes('/api/v1/'))network.push([new URL(r.url()).pathname,r.status()]);});
 p.on('requestfailed',r=>{if(r.url().includes('/api/v1/'))network.push([new URL(r.url()).pathname,'FAILED',r.failure()]);});
 const browserErrors=[];p.on('pageerror',e=>browserErrors.push(e.message.slice(0,85)));
 const res=await p.goto('http://127.0.0.1:5173/login',{waitUntil:'domcontentloaded',timeout:20000});
 await p.waitForTimeout(2500);
 console.log('GUEST_BROWSER_HTTP',res.status());
 console.log('GUEST_BROWSER_URL',new URL(p.url()).pathname);
 console.log('GUEST_BROWSER_HEADINGS',JSON.stringify(await p.locator('h1,h2,button').allTextContents()).slice(0,800));
 console.log('GUEST_BROWSER_NETWORK',JSON.stringify(network).slice(0,1200));
 console.log('GUEST_BROWSER_ERRORS',JSON.stringify(browserErrors).slice(0,1200));
 console.log('GUEST_BROWSER_INPUTS',JSON.stringify(await p.locator('input').evaluateAll(xs=>xs.map(x=>({id:x.id,placeholder:x.placeholder})))));
 console.log('GUEST_BROWSER_BODY',JSON.stringify((await p.locator('body').innerText()).slice(0,650)));
 console.log('GUEST_BROWSER_PRIVACY',(await p.locator('#account-delete-code,#account-delete-username').count())===0?'PASS':'FAIL');
 await context.close();
}finally{await browser.close();}
