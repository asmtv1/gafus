/** A read-only, real Hono + real Chromium admin screen check for WORK only.
 * Signed JWTs arrive via stdin, stay in process memory, never appear in logs,
 * and Chromium receives no secrets in the process environment.
 */
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from '../../.local-browser-mcp/node_modules/playwright/index.mjs';

const root = '/Users/asmtv1/Desktop/gafus-refactor';
const origin = process.env.GAFUS_ADMIN_ISOLATED_ALTERNATE === '1'
  ? 'http://127.0.0.1:5373' : 'http://127.0.0.1:5173';
if (process.env.GAFUS_TEST_BROWSER_WORK !== '1' || process.cwd() !== root ||
  execFileSync('git',['-C',root,'rev-parse','--show-toplevel'],{encoding:'utf8'}).trim() !== root ||
  execFileSync('git',['-C',root,'branch','--show-current'],{encoding:'utf8'}).trim() !== 'vite')
  throw Error('BROWSER_STRICT_REFACTOR_GUARD_DENIED');
const binary = root + '/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if (!existsSync(binary) || !realpathSync(binary).startsWith(root+'/'))
  throw Error('BROWSER_BINARY_OUTSIDE_REFACTOR');
const parsed = JSON.parse(readFileSync(0, 'utf8'));
if (!parsed || typeof parsed.adminJwt !== 'string' || typeof parsed.modJwt !== 'string' ||
  parsed.adminJwt.length < 100 || parsed.modJwt.length < 100 ||
  typeof parsed.adminLogin?.username !== 'string' || typeof parsed.adminLogin?.password !== 'string' ||
  (process.env.GAFUS_ADMIN_ISOLATED_ALTERNATE === '1' &&
    (!/^[A-Za-z0-9_-]{1,128}$/.test(parsed.syntheticTargetId ?? '') ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.uiModeration?.reportId ?? '') ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.uiModeration?.title ?? '') ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.uiPartnerId ?? '') ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.uiTrainerId ?? ''))))
  throw Error('BROWSER_CREDENTIALS_MISSING');
// Only real login, guest refresh and logout for a synthetic WORK ADMIN may POST;
// all business actions remain GET-only.
const ping = await fetch(origin+'/main-panel',{signal:AbortSignal.timeout(3000)}).catch(()=>null);
if (ping?.status !== 200) throw Error('WORK_VITE_UNREACHABLE');
const browser = await chromium.launch({executablePath:binary,headless:true,args:['--no-sandbox'],
  env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: root,
    TMPDIR: root + '/.local-browser-mcp/tmp', XDG_CACHE_HOME: root + '/.local-browser-mcp/cache' }});
try {
  // Explicit opt-in: the already-running 3001 service must have loaded the
  // new loopback-cookie policy; this harness never restarts another agent's API.
  if (process.env.GAFUS_CHECK_LIVE_BROWSER_LOGIN === '1') {
  // Unlike programmatic JWT cookies, this proves the actual Web UI login,
  // HttpOnly Set-Cookie transport, refresh of an authenticated page and logout.
  const loginContext = await browser.newContext({viewport:{width:1280,height:844},serviceWorkers:'block'});
  await loginContext.route('**/*',route=>{
    const request=route.request(), url=new URL(request.url());
    if(url.origin!==origin) return route.abort('blockedbyclient');
    if(['GET','HEAD'].includes(request.method())) return route.continue();
    if(request.method()==='POST' && url.pathname==='/api/v1/auth/login') {
      let body;
      try { body=JSON.parse(request.postData() ?? 'null'); } catch { body=null; }
      if(body?.username===parsed.adminLogin.username && body?.password===parsed.adminLogin.password)
        return route.continue();
    }
    if(request.method()==='POST' && ['/api/v1/auth/refresh','/api/v1/auth/logout'].includes(url.pathname) && request.postData()==='{}')
      return route.continue();
    if(process.env.GAFUS_ADMIN_ISOLATED_ALTERNATE==='1' && request.method()==='POST' &&
      url.pathname===`/api/v1/admin/users/${parsed.syntheticTargetId}/app-subscription` &&
      ['paid_until','lifetime','clear'].includes(JSON.parse(request.postData()??'null')?.action))
      return route.continue();
    if(process.env.GAFUS_ADMIN_ISOLATED_ALTERNATE==='1' && request.method()==='POST' &&
      url.pathname==='/api/v1/admin/moderation/questions/reports') {
      let body;
      try { body=JSON.parse(request.postData()??'null'); } catch { body=null; }
      if(body?.reportId===parsed.uiModeration.reportId && body?.action==='dismiss' &&
        typeof body.reason==='string' && body.reason.length>0 && body.reason.length<=1000)
        return route.continue();
    }
    if(process.env.GAFUS_ADMIN_ISOLATED_ALTERNATE==='1' && request.method()==='POST' &&
      url.pathname===`/api/v1/admin/partners/${parsed.uiPartnerId}/mark-paid` &&
      !request.postData()) return route.continue();
    if(process.env.GAFUS_ADMIN_ISOLATED_ALTERNATE==='1' && request.method()==='PUT' &&
      url.pathname===`/api/v1/admin/consultations/schedules/${parsed.uiTrainerId}`) {
      let body;
      try {body=JSON.parse(request.postData()??'null');}catch{body=null;}
      if(body?.rules?.length===7 && body.rules.every(rule=>
        Number.isInteger(rule.weekday) && rule.weekday>=0 && rule.weekday<=6 &&
        typeof rule.isWorkingDay==='boolean' &&
        (rule.weekday===0 ? rule.startTime==='12:00'&&rule.endTime==='13:00' :
          rule.startTime==='10:00'&&rule.endTime==='11:00')))
        return route.continue();
    }
    return route.abort('blockedbyclient');
  });
  const loginPage=await loginContext.newPage();
  const authStatuses=[];
  loginPage.on('response',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/v1/auth/')) authStatuses.push(`${u.pathname}:${r.status()}`);});
  await loginPage.goto(origin+'/main-panel',{waitUntil:'domcontentloaded',timeout:12000});
  try { await loginPage.locator('.auth-card input[autocomplete="username"]').waitFor({timeout:12000}); }
  catch {
    console.log(`CHROMIUM_WORK_ADMIN_LOGIN_FORM_NOT_SHOWN AUTH_STATUSES_${authStatuses.join(',') || 'none'}`);
    throw Error('WORK_BROWSER_LOGIN_FORM_UNAVAILABLE');
  }
  await loginPage.locator('.auth-card input[autocomplete="username"]').fill(parsed.adminLogin.username);
  await loginPage.locator('.auth-card input[type="password"]').fill(parsed.adminLogin.password);
  const loginReceipt=loginPage.waitForResponse(r=>r.url().endsWith('/api/v1/auth/login') && r.request().method()==='POST',{timeout:12000});
  await loginPage.locator('.auth-card button[type="submit"]').click();
  const loggedIn=await loginReceipt;
  if(loggedIn.status()!==200) throw Error(`WORK_BROWSER_LOGIN_HTTP_${loggedIn.status()}`);
  await loginPage.locator('nav[aria-label="Разделы админ-панели"] a').first().waitFor({timeout:12000});
  const cookies=await loginContext.cookies(origin+'/api/v1/auth/me');
  if(!cookies.some(cookie=>cookie.name==='gafus_access' && cookie.httpOnly && cookie.path==='/api/v1')) {
    const headers=await loggedIn.headersArray();
    const receipt=headers.filter(h=>h.name.toLowerCase()==='set-cookie')
      .map(h=>({name:h.value.split('=')[0],secure:/;\s*secure/i.test(h.value),
        path:h.value.match(/;\s*path=([^;]+)/i)?.[1] ?? 'none'}));
    console.log(`WORK_BROWSER_LOGIN_COOKIE_METADATA ${JSON.stringify(receipt)} stored_${cookies.length}`);
    throw Error('WORK_BROWSER_LOGIN_HTTPONLY_COOKIE_ABSENT');
  }
  await loginPage.reload({waitUntil:'domcontentloaded',timeout:12000});
  await loginPage.locator('nav[aria-label="Разделы админ-панели"] a').first().waitFor({timeout:12000});
  // Simulate an expired access token while retaining the real HttpOnly refresh
  // cookie produced by Hono. The client must transparently rotate its session.
  const beforeRefresh=await loginContext.cookies(origin+'/api/v1/auth/me');
  const oldRefresh=beforeRefresh.find(cookie=>cookie.name==='gafus_refresh')?.value;
  if(!oldRefresh) throw Error('WORK_BROWSER_REFRESH_COOKIE_NOT_ISSUED');
  await loginContext.addCookies([{
    name:'gafus_access',value:'qa-expired-access',domain:'127.0.0.1',path:'/api/v1',
    httpOnly:true,secure:false,sameSite:'Lax',
  }]);
  const refreshReceipt=loginPage.waitForResponse(r=>
    r.url().endsWith('/api/v1/auth/refresh') && r.request().method()==='POST',
  {timeout:12000});
  await loginPage.reload({waitUntil:'domcontentloaded',timeout:12000});
  const refreshed=await refreshReceipt;
  if(refreshed.status()!==200) throw Error(`WORK_BROWSER_REFRESH_HTTP_${refreshed.status()}`);
  await loginPage.locator('nav[aria-label="Разделы админ-панели"] a').first().waitFor({timeout:12000});
  const rotated=await loginContext.cookies(origin+'/api/v1/auth/me');
  if(!rotated.some(cookie=>cookie.name==='gafus_access' && cookie.httpOnly &&
      cookie.value.length>100 && cookie.value!=='qa-expired-access') ||
    !rotated.some(cookie=>cookie.name==='gafus_refresh' && cookie.httpOnly &&
      cookie.value.length>100 && cookie.value!==oldRefresh))
    throw Error('WORK_BROWSER_REFRESH_COOKIES_NOT_ROTATED');
  if(process.env.GAFUS_ADMIN_ISOLATED_ALTERNATE==='1') {
    const path=`/api/v1/admin/users/${parsed.syntheticTargetId}/app-subscription`;
    await loginPage.goto(`${origin}/main-panel/users/${parsed.syntheticTargetId}/app-subscription`,
      {waitUntil:'domcontentloaded',timeout:12000});
    await loginPage.locator('.subscription-form select').waitFor({timeout:12000});
    loginPage.on('dialog',dialog=>{
      if(dialog.type()==='confirm') return dialog.accept();
      return dialog.dismiss();
    });
    const steps=['paid_until','lifetime','clear'];
    let written=0;
    for(const action of steps) {
      await loginPage.locator('.subscription-form select').selectOption(action);
      if(action==='paid_until') {
        const until=new Date(Date.now()+33*86_400_000).toISOString().slice(0,16);
        await loginPage.locator('.subscription-form input[type="datetime-local"]').fill(until);
      }
      const post=loginPage.waitForResponse(response=>
        new URL(response.url()).pathname===path && response.request().method()==='POST',
      {timeout:12000});
      const subsequentGet=loginPage.waitForResponse(response=>
        new URL(response.url()).pathname===path && response.request().method()==='GET',
      {timeout:12000});
      await loginPage.locator('.subscription-form button[type="submit"]').click();
      const updated=await post;
      if(updated.status()!==200) throw Error(`WORK_BROWSER_MANUAL_SUBSCRIPTION_${action}_${updated.status()}`);
      const reread=await subsequentGet;
      if(reread.status()!==200) throw Error(`WORK_BROWSER_MANUAL_SUBSCRIPTION_READBACK_${action}_${reread.status()}`);
      await loginPage.locator('.subscription-form select').waitFor({timeout:12000});
      written++;
    }
    console.log(`CHROMIUM_WORK_ADMIN_MANUAL_SUBSCRIPTION_UI_${written}/${steps.length} PASS`);
    await loginPage.goto(origin+'/main-panel/questions',
      {waitUntil:'domcontentloaded',timeout:12000});
    const card=loginPage.locator('.moderation-report').filter({
      has:loginPage.getByRole('heading',{name:parsed.uiModeration.title,exact:true}),
    });
    await card.getByRole('button',{name:'Отклонить жалобу'}).waitFor({timeout:12000});
    const reportReceipt=loginPage.waitForResponse(response=>
      new URL(response.url()).pathname==='/api/v1/admin/moderation/questions/reports' &&
      response.request().method()==='POST', {timeout:12000});
    const refreshedReport=loginPage.waitForResponse(response=>
      new URL(response.url()).pathname==='/api/v1/admin/moderation/questions/reports' &&
      response.request().method()==='GET', {timeout:12000});
    await card.getByRole('button',{name:'Отклонить жалобу'}).click();
    const reportDone=await reportReceipt;
    if(reportDone.status()!==200) throw Error(`WORK_BROWSER_QUESTION_DISMISS_${reportDone.status()}`);
    const reread=await refreshedReport;
    if(reread.status()!==200) throw Error(`WORK_BROWSER_QUESTION_READBACK_${reread.status()}`);
    await card.waitFor({state:'detached',timeout:12000});
    console.log('CHROMIUM_WORK_ADMIN_QUESTION_MODERATION_UI_DISMISS_PASS');
    await loginPage.goto(`${origin}/main-panel/partners/${parsed.uiPartnerId}`,
      {waitUntil:'domcontentloaded',timeout:12000});
    const payBtn=loginPage.getByRole('button', {name:'Отметить весь баланс выплаченным'});
    await payBtn.waitFor({timeout:12000});
    if(await payBtn.isDisabled()) throw Error('WORK_BROWSER_PARTNER_PAY_BUTTON_DISABLED');
    const payReceipt=loginPage.waitForResponse(r=>
      new URL(r.url()).pathname===`/api/v1/admin/partners/${parsed.uiPartnerId}/mark-paid` &&
      r.request().method()==='POST',{timeout:12000});
    await payBtn.click();
    const paid=await payReceipt;
    if(paid.status()!==200) throw Error(`WORK_BROWSER_PARTNER_PAY_${paid.status()}`);
    await loginPage.getByText('Выплата отмечена в учёте',{exact:false})
      .first().waitFor({timeout:12000}).catch(()=>{});
    console.log('CHROMIUM_WORK_ADMIN_PARTNER_MARK_PAID_UI_PASS');
    await loginPage.goto(`${origin}/main-panel/consultations/trainers-schedules?trainerId=${parsed.uiTrainerId}`,
      {waitUntil:'domcontentloaded',timeout:12000});
    const firstRow=loginPage.locator('.schedule-editor table tbody tr').first();
    await firstRow.locator('input[type="time"]').first().waitFor({timeout:12000});
    await firstRow.locator('input[type="time"]').first().fill('12:00');
    await firstRow.locator('input[type="time"]').nth(1).fill('13:00');
    const scheduleAck=loginPage.waitForResponse(r=>
      new URL(r.url()).pathname===`/api/v1/admin/consultations/schedules/${parsed.uiTrainerId}` &&
      r.request().method()==='PUT',{timeout:12000});
    const scheduleReadback=loginPage.waitForResponse(r=>
      new URL(r.url()).pathname===`/api/v1/admin/consultations/schedules/${parsed.uiTrainerId}` &&
      r.request().method()==='GET',{timeout:12000});
    await loginPage.getByRole('button',{name:'Сохранить расписание'}).click();
    const saved=await scheduleAck;
    if(saved.status()!==200) throw Error(`WORK_BROWSER_TRAINER_SCHEDULE_PUT_${saved.status()}`);
    const rereadSchedule=await scheduleReadback;
    if(rereadSchedule.status()!==200) throw Error(`WORK_BROWSER_TRAINER_SCHEDULE_GET_${rereadSchedule.status()}`);
    console.log('CHROMIUM_WORK_ADMIN_TRAINER_WEEKLY_RULES_UI_PUT_PASS');
  }
  const logoutReceipt=loginPage.waitForResponse(r=>r.url().endsWith('/api/v1/auth/logout') && r.request().method()==='POST',{timeout:12000});
  await loginPage.getByRole('button',{name:'Выйти'}).click();
  const loggedOut=await logoutReceipt;
  if(loggedOut.status()!==200) throw Error(`WORK_BROWSER_LOGOUT_HTTP_${loggedOut.status()}`);
  await loginPage.locator('.auth-card').waitFor({timeout:12000});
  if((await loginContext.cookies(origin+'/api/v1/auth/me')).some(cookie=>cookie.name==='gafus_access'))
    throw Error('WORK_BROWSER_LOGOUT_ACCESS_COOKIE_RETAINED');
  console.log('CHROMIUM_WORK_ADMIN_LOGIN_RELOAD_REFRESH_ROTATION_LOGOUT 4/4 PASS');
  await loginContext.close();
  }

  // Short opt-in mode exercises ONLY real cookie login and precisely scoped
  // synthetic writes. The existing full 18+5 read-only navigation mode is
  // unchanged by default and is exercised separately.
  const writesOnly = process.env.GAFUS_ADMIN_WRITES_ONLY === '1' &&
    process.env.GAFUS_ADMIN_ISOLATED_ALTERNATE === '1' &&
    process.env.GAFUS_CHECK_LIVE_BROWSER_LOGIN === '1';
  for (const [role,jwt,expectedPages,width] of (writesOnly ? [] : [
    ['ADMIN',parsed.adminJwt,18,1280],['MODERATOR',parsed.modJwt,5,390],
  ])) {
    const context = await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
    await context.addCookies([{name:'gafus_access',value:jwt,domain:'127.0.0.1',path:'/api/v1',httpOnly:true,secure:false,sameSite:'Lax'}]);
    let unauthorized=0;
    let otherFailure=0;
    const runtime=[];
    const documentStatuses=[];
    const failedResources=[];
    const failedHttp=[];
    const consoleErrors=[];
    await context.route('**/*',route=>{
      const request=route.request();
      const url=new URL(request.url());
      if(url.origin !== origin) return route.abort('blockedbyclient');
      if(!['GET','HEAD'].includes(request.method())) throw Error('READONLY_BROWSER_BLOCKED_MUTATION');
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror',error=>runtime.push(error.message.slice(0,120)));
    page.on('console',message=>{if(message.type()==='error') consoleErrors.push(message.location().url?.split('/').slice(-2).join('/').slice(0,100) ?? 'no-location');});
    page.on('response',response=>{if(response.request().isNavigationRequest()) documentStatuses.push(response.status());
      if(response.status()>=400) failedHttp.push(`${response.status()}:${new URL(response.url()).pathname.slice(0,100)}`);});
    page.on('requestfailed',request=>{if(request.url().includes('/src/') || request.isNavigationRequest()) failedResources.push(new URL(request.url()).pathname);});
    page.on('response',response=>{
      if(response.url().startsWith(origin+'/api/v1/')) {
        if([401,403].includes(response.status())) unauthorized++;
        else if(response.status() >= 400) otherFailure++;
      }
    });
    await page.goto(origin+'/main-panel',{waitUntil:'domcontentloaded',timeout:12000});
    await page.locator('nav[aria-label="Разделы админ-панели"] a').first().waitFor({timeout:14000});
    const hrefs=await page.locator('nav[aria-label="Разделы админ-панели"] a').evaluateAll(nodes=>
      nodes.map(n=>n.getAttribute('href')));
    if(hrefs.length!==expectedPages) throw Error(`${role}_NAV_EXPECTED_${expectedPages}_GOT_${hrefs.length}`);
    let passed=0;
    for (const href of hrefs) {
      if(role === 'ADMIN') {
        // SPA navigation keeps a single actual login session: no artificial
        // auth/me polling or shared-IP auth-session rate-limit exhaustion.
        await page.locator(`nav[aria-label="Разделы админ-панели"] a[href="${href}"]`).click();
        try {
          await page.waitForFunction(path=>window.location.pathname===path &&
            !!document.getElementById('root')?.shadowRoot?.querySelector('.page-heading h1'),href,{timeout:8000});
        } catch {
          const state = await page.evaluate(() => ({
            login: !!document.getElementById('root')?.shadowRoot?.querySelector('.auth-card'),
            shell: !!document.getElementById('root')?.shadowRoot?.querySelector('.admin-layout'),
            nav: !!document.getElementById('root')?.shadowRoot?.querySelector('nav[aria-label="Разделы админ-панели"]'),
            heading: !!document.getElementById('root')?.shadowRoot?.querySelector('.page-heading'),
            denied: !!document.getElementById('root')?.shadowRoot?.querySelector('.workspace-content .content-card'),
            ready: document.readyState,
            root: !!document.querySelector('#root'),
            scripts: document.scripts.length,
            mountedChars: document.querySelector('#root')?.textContent?.length ?? -1,
          })).catch(()=>({login:false,shell:false,nav:false,heading:false,denied:false}));
          throw Error(`ADMIN_SPA_NAV_TIMEOUT_${href}_${new URL(page.url()).pathname}_${JSON.stringify(state)}_DOC_${documentStatuses.join(',')}_FAILED_${failedResources.join(',')}_JS_${runtime.length}_HTTP_${failedHttp.join(',')}_CONSOLE_${consoleErrors.join(',')}`);
        }
      } else {
        await page.goto(origin+href,{waitUntil:'domcontentloaded',timeout:12000});
        await page.locator('.page-heading h1').waitFor({timeout:12000});
      }
      if(await page.getByText('Страница не найдена',{exact:true}).count())
        throw Error(`${role}_INVALID_ROUTE_${href}`);
      // Dynamic data panels should actually complete their GET, not just paint a heading.
      await page.waitForFunction(() => !document.getElementById('root')?.shadowRoot?.querySelector('.workspace-content .loading'),undefined,{timeout:7000});
      if(await page.locator('.workspace-content > .content-card.error').count())
        throw Error(`${role}_API_ERROR_${href}`);
      passed++;
    }
    if(role === 'ADMIN') {
      const deepLinks = [
        ['/main-panel/app-subscriptions?tab=promo-codes&includeArchived=1','tab=promo-codes'],
        ['/main-panel/app-subscriptions?tab=npd&npdStatus=PENDING','npdStatus=PENDING'],
        ['/main-panel/profit?from=2026-10-01&to=2026-10-15&paymentPage=2&videoPage=1','from=2026-10-01'],
        ['/main-panel/rewarded-ads?period=7','days=7'],
        ['/main-panel/mobile-intro?start=2026-10-01&end=2026-10-15','start=2026-09-30'],
        ['/main-panel/users?search=QAMOD','/api/v1/admin/users'],
      ];
      let checked = 0;
      for(const [href, expectedGet] of deepLinks) {
        const responsePromise = page.waitForResponse(response=>
          response.url().startsWith(origin+'/api/v1/') &&
          response.request().method()==='GET' && response.url().includes(expectedGet),
        {timeout:12000});
        await page.goto(origin+href,{waitUntil:'domcontentloaded',timeout:12000});
        let response;
        try { response = await responsePromise; }
        catch { throw Error(`QUERY_FILTER_GET_NOT_OBSERVED_${href}_${expectedGet}`); }
        if(response.status()!==200) throw Error(`QUERY_FILTER_HTTP_${href}_${response.status()}`);
        await page.locator('.page-heading h1').waitFor({timeout:10000});
        await page.waitForFunction(() => !document.getElementById('root')?.shadowRoot?.querySelector('.workspace-content .loading'),undefined,{timeout:8000});
        if(await page.locator('.workspace-content > .content-card.error').count())
          throw Error(`QUERY_FILTER_PAGE_ERROR_${href}`);
        checked++;
      }
      console.log(`CHROMIUM_WORK_COOKIE_ADMIN_DEEP_LINKS ${checked}/${deepLinks.length} PASS`);
    }
    if(runtime.length) throw Error(`${role}_RUNTIME_ERRORS_${runtime.length}_${runtime[0]}`);
    if(unauthorized || otherFailure)
      throw Error(`${role}_API_HTTP_ERRORS_AUTH_${unauthorized}_OTHER_${otherFailure}`);
    console.log(`CHROMIUM_WORK_COOKIE_${role} ${passed}/${expectedPages} PASS`);
    await context.close();
  }
  if (writesOnly) console.log('CHROMIUM_WORK_SYNTHETIC_WRITES_ONLY_PASS');
} finally { await browser.close(); }
