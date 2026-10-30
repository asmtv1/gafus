/** Read-only Chromium smoke against an existing Refactor Web Vite 5173 server.
 * API DTOs are synthetic and POST/DELETE are forbidden. No server restarts.
 */
import { existsSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
import { sectionFixture } from '../../apps/admin-panel/src/admin-live/browserFixtures.mjs';
const project = '/Users/asmtv1/Desktop/gafus-refactor';
if (process.cwd() !== project || execFileSync('git',['-C',project,'rev-parse','--show-toplevel'],{encoding:'utf8'}).trim()!==project ||
  execFileSync('git',['-C',project,'branch','--show-current'],{encoding:'utf8'}).trim()!=='vite') {
  throw Error('STRICT_REFACTOR_ROOT_OR_BRANCH_DENIED');
}
const bin = project + '/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if (!existsSync(bin) || !realpathSync(bin).startsWith(project+'/')) throw Error('NONPROJECT_BROWSER_BINARY_DENIED');
const origin = 'http://127.0.0.1:5173';
const root = await fetch(origin+'/main-panel').catch(()=>null);
if (root?.status!==200 || !(await root.text()).includes('id="root"')) throw Error('WEB_5173_NOT_READY');
const browser=await chromium.launch({executablePath:bin,headless:true,args:['--no-sandbox']});
try {
 const guest=await browser.newContext({serviceWorkers:'block'});
 await guest.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 const g=await guest.newPage();
 await g.goto(origin+'/main-panel/users',{waitUntil:'domcontentloaded',timeout:12000});
 await g.locator('.auth-card').waitFor({timeout:15000});
 console.log('GUEST_BROWSER_LOGIN_SCREEN PASS');
 await guest.close();
 for (const [role,allowed] of [
  ['ADMIN',18],['MODERATOR',5],
 ]) {
  const context=await browser.newContext({viewport:{width:role==='ADMIN'?1280:390,height:844},serviceWorkers:'block'});
  const errors=[];
  await context.route('**/*',r=>{
    const req=r.request(),url=new URL(req.url());
    if(url.origin!==origin) return r.abort('blockedbyclient');
    if(url.pathname==='/api/v1/auth/me')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:{id:role==='ADMIN'?'synthetic-admin':'synthetic-moderator',role,username:'qa-only'}})});
    if(url.pathname.startsWith('/api/v1/')) {
      if(req.method()!=='GET')throw Error('READ_ONLY_NO_ADMIN_MUTATIONS');
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:sectionFixture(url.pathname+url.search)})});
    }
    return r.continue();
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/main-panel',{waitUntil:'domcontentloaded',timeout:12000});
  const nav=page.locator('nav[aria-label="Разделы админ-панели"] a');
  await nav.first().waitFor({timeout:14000});
  const hrefs=await nav.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
  if(hrefs.length!==allowed)throw Error(`${role}: expected ${allowed} links, got ${hrefs.length}`);
  let passed=0;
  for (const href of hrefs) {
   await page.goto(origin+href,{waitUntil:'domcontentloaded',timeout:12000});
   await page.locator('.page-heading h1').waitFor({timeout:14000});
   if(await page.getByText('Страница не найдена',{exact:true}).count())throw Error(`BAD_ROUTE ${href}`);
   if(await page.locator('.workspace-content [role="alert"].error').count())throw Error(`PAGE_ERROR ${href}`);
   passed++;
  }
  if(errors.length)throw Error(`${role}: runtime errors: ${errors.join(' | ').slice(0,400)}`);
  console.log(`CHROMIUM_${role}_READONLY ${passed}/${allowed} PASS`);
  await context.close();
 }
}finally{await browser.close();}
