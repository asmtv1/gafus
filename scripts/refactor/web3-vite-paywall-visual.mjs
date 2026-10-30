/** WEB3 dedicated actual Chromium → own Hono3103 → Core → private WORK PG.
 * Compares Vite snapshots only against retained original Next screenshots;
 * this is NOT an equivalent new same-run Next/Vite full visual receipt. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync} from 'node:fs';
import {chromium} from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
if(process.cwd()!==ROOT||process.env.GAFUS_WEB3_REAL_BROWSER!=='1'||
 process.env.GAFUS_WEB3_VITE_ONLY!=='1')throw Error('WEB3_OWN_PAYWALL_GUARD_DENIED');
const lease=ROOT+'/.local-pg-scratch/web3-unified-private.json';
if(!existsSync(lease)||lstatSync(lease).isSymbolicLink())throw Error('WEB3_OWN_PAYWALL_LEASE_DENIED');
const fixture=JSON.parse(readFileSync(lease,'utf8'));
if(fixture.users?.length!==2||
 fixture.users[0].username!=='web3_parity_'+fixture.users[0].id.replaceAll('-','')||
 !/^WEB3_PARITY_[0-9a-f]{8}$/.test(fixture.courseType)||
 !Array.isArray(fixture.articleSlugs)||fixture.articleSlugs.length!==2)
 throw Error('WEB3_OWN_PAYWALL_ACTOR_DENIED');
const label=process.env.GAFUS_WEB3_VISUAL_RUN_LABEL||'';
if(!/^own-vite-paywall-[a-z0-9-]+$/.test(label))throw Error('WEB3_OWN_PAYWALL_OUTPUT_DENIED');
const out=ROOT+'/.design-verify/web3-vite-only-'+label;
if(existsSync(out))throw Error('WEB3_OWN_PAYWALL_OUTPUT_ALREADY_EXISTS');
mkdirSync(out,{recursive:true});
const chrome=ROOT+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if(!existsSync(chrome))throw Error('WEB3_CHROMIUM_UNAVAILABLE');
const browser=await chromium.launch({headless:true,executablePath:chrome,
 args:['--no-sandbox','--disable-background-networking','--disable-gpu'],
 env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:ROOT+'/.local-browser-mcp/.cache/home',
 XDG_CACHE_HOME:ROOT+'/.local-browser-mcp/.cache/tmp'}});
const results=[];
let failures=0;
const port='http://127.0.0.1:5183';
try{
 for(const v of [{name:'desktop',width:1280,height:800},{name:'mobile',width:390,height:844}]){
  for(const auth of ['member','guest']){
   const ctx=await browser.newContext({viewport:{width:v.width,height:v.height},
    locale:'ru-RU',deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
   const counts={articleGet:0,viewPost:0,providerMutation:0,subscriptionOffer:0};
   let accessToken='';
   try{
    if(auth==='member'){
     const response=await ctx.request.post(port+'/api/v1/auth/login',{
      data:{username:fixture.users[0].username,password:fixture.users[0].password},
      timeout:15000});
     const body=await response.json().catch(()=>null);
     if(response.status()!==200||typeof body?.data?.accessToken!=='string')
      throw Error('WEB3_OWN_PAYWALL_LOGIN_'+response.status());
     accessToken=body.data.accessToken;
    }
    await ctx.addInitScript(()=>{try{localStorage.setItem('gafus:cookieConsent:v1','accepted')}catch{}});
    await ctx.route('**/*',async route=>{
      const u=new URL(route.request().url());
      if(!['127.0.0.1','localhost'].includes(u.hostname)||
          !['5183','3103'].includes(u.port))return route.abort();
      if(u.pathname.startsWith('/api/v1/app-subscription/offer'))counts.subscriptionOffer++;
      if(u.pathname.includes('/yookassa/')||u.pathname.includes('/payments/'))
       counts.providerMutation++;
      if(u.pathname.startsWith('/api/v1/articles/')&&route.request().method()==='GET')
       counts.articleGet++;
      if(u.pathname.includes('/articles/')&&u.pathname.endsWith('/view')&&
       route.request().method()==='POST')counts.viewPost++;
      if(accessToken&&u.pathname.startsWith('/api/v1/')){
       return route.continue({headers:{...route.request().headers(),authorization:'Bearer '+accessToken}});
      }
      return route.continue();
    });
    const page=await ctx.newPage();
    for(const kind of ['paid','public']){
     if(auth==='guest'&&kind==='public')continue;
     const slug=fixture.articleSlugs[kind==='public'?0:1];
     const id=kind+'-'+auth+'-'+v.name;
     const response=await page.goto(port+'/articles/'+encodeURIComponent(slug),{
      waitUntil:'domcontentloaded',timeout:30000});
     await page.waitForTimeout(1100);
     try{await page.waitForLoadState('networkidle',{timeout:3500});}catch{}
     const body=await page.locator('body').innerText();
     const mustHave=kind==='paid'?'WEB3 Платная статья':'WEB3 Статья о прогулках';
     const expectedPaywall=auth==='member'?'Подписка, которая экономит время и деньги':'Нужен доступ';
     const found=body.includes(mustHave)&&body.includes(expectedPaywall);
     const noPricing=auth==='guest'||body.includes('Тарифы и оформление подписки пока недоступны');
     if(kind==='paid'&&auth==='member'){
      const btn=page.getByRole('button',{name:'Проверить доступ к статье'});
      if(await btn.count()){
       const before=counts.articleGet;
       await btn.click();
       await page.waitForTimeout(600);
       if(counts.articleGet<=before)throw Error('WEB3_PAYWALL_GET_RELOAD_MISSING');
      }
     }
     const screenshot=out+'/'+id+'.png';
     await page.screenshot({path:screenshot,fullPage:false,animations:'disabled',timeout:10000});
     const ok=response?.status()===200&&found&&noPricing&&
       counts.subscriptionOffer===0&&counts.providerMutation===0;
     results.push({id,viewport:v.name,kind,auth,status:response?.status()??null,
       found,noPricing,screenshot:id+'.png',
       articleGet:counts.articleGet,viewPost:counts.viewPost,
       subscriptionOffer:counts.subscriptionOffer,providerMutation:counts.providerMutation,
       valid:ok});
     console.log('WEB3_VITE_PAYWALL',id,'STATUS',response?.status(),'FOUND',found,
       'NO_LIVE_OFFER',counts.subscriptionOffer===0,'NO_PROVIDER_MUTATION',counts.providerMutation===0,
       'VALID',ok);
     if(!ok)failures++;
    }
   }finally{await ctx.close()}
  }
 }
}finally{
 writeFileSync(out+'/matrix.json',JSON.stringify({label,source:'Vite-only, actual real Hono + private WORK SQL; retained original Next reference is prior separate run',
  failures,results},null,2)+'\n');
 await browser.close();
}
console.log('WEB3_VITE_PAYWALL_RESULT',results.length,'SCREENS','FAILURES',failures,out);
if(failures)process.exitCode=1;
