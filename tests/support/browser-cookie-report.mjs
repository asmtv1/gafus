/** Advisory-only, fail-closed verification of Chrome Extension + real Hono/PG cookie receipts. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const sourcePaths={
  app:'apps/api/src/app.ts',cors:'apps/api/src/middleware/cors.ts',
  cookieAuth:'apps/api/src/lib/browser-auth.ts',
  driver:'apps/api/src/test/qa-browser-cookie-driver.js',
  runner:'apps/api/src/test/qa-browser-cookie-server.mts',
  cases:'tests/catalog/browser-cookie-cases.json',
};
const norm=x=>JSON.stringify(x);
function equal(actual,expected,label){if(norm(actual)!==norm(expected))throw Error('BROWSER_COOKIE_QA_'+label)}
function fail(label){throw Error('BROWSER_COOKIE_QA_'+label)}
function cookieProbe(probe,active,label){
  if(!probe||typeof probe!=='object'||probe.access!==active||probe.refresh!==active)fail(label+'_PRESENCE');
  const fields=['accessFingerprint','refreshFingerprint'];
  for(const f of fields)if(active?!/^[a-f0-9]{16}$/.test(probe[f]??''):probe[f]!==null)fail(label+'_HASH');
}
function cookieAttributes(data,clear,label){
  if(!Array.isArray(data)||data.length!==2||new Set(data.map(x=>x.name)).size!==2||
     !data.some(x=>x.name==='gafus_access')||!data.some(x=>x.name==='gafus_refresh'))fail(label+'_COOKIE_NAMES');
  if(data.some(x=>x.httpOnly!==true||x.sameSiteLax!==true||x.path!==true||
      x.secure!==false||x.deleting!==clear))fail(label+'_COOKIE_SECURITY');
}
export function verifyBrowserCookieReport(test, evidence, resources, task, root){
  const matrix=JSON.parse(readFileSync(resolve(root,'tests/catalog/browser-cookie-cases.json'),'utf8'));
  const expected=matrix.cases;
  if(matrix.schema!==1||expected.length!==13||task?.id!=='api.browser-cookie.chrome-pg-redis'||
     task.kind!=='browser-cookie'||norm(task.expectedCases)!==norm(expected.map(x=>x.step)))
    fail('PLAN_CASES_MISSING_OR_CHANGED');
  if(!test||test.numPassedTests!==13||test.numFailedTests!==0||test.numPendingTests!==0||
    !Array.isArray(test.testResults)||test.testResults.length!==1||
    test.testResults[0]?.name!==resolve(root,sourcePaths.runner)||
    norm(test.testResults[0]?.assertionResults?.map(x=>({name:x.fullName,status:x.status})))!==
       norm(expected.map(x=>({name:x.step,status:'passed'}))))
    fail('NAMED_CASE_REPORT_NOT_EXACT');
  if(!evidence||evidence.schema!==1||evidence.browser!=='existing-chrome-playwright-extension-default-context'||
    evidence.connection!=='loopback-original-mounted-hono-postgresql18-redis'||
    evidence.finished!==true||evidence.received!==13||!Array.isArray(evidence.steps)||evidence.steps.length!==13||
    !/^[a-f0-9]{12}$/.test(evidence.run??'')||
    !Number.isInteger(evidence.port)||evidence.port<1024||evidence.port>65535||
    !/^archqa_cookie_[a-f0-9]{12}$/.test(evidence.db??''))fail('NON_ISOLATED_BROWSER_OR_SQL_RECEIPT');
  const origins={};for(const host of ['a','b','c'])origins[host]=`http://qa-${host}-${evidence.run}.localhost:${evidence.port}`;
  equal(evidence.originHosts,['a','b','c'].map(x=>`qa-${x}-${evidence.run}.localhost`),'HOST_WHITELIST');
  for(const [key,path] of Object.entries(sourcePaths)){
    const hash=createHash('sha256').update(readFileSync(resolve(root,path),'utf8')).digest('hex');
    if(evidence.sourceHashes?.[key]!==hash)fail('SOURCE_SHA_CHANGED_'+key);
  }
  const wrapperHash=createHash('sha256').update(readFileSync(resolve(root,'scripts/qa/api-browser-cookie-isolated.sh'))).digest('hex');
  if(!resources||resources.schema!==1||resources.database!==evidence.db||
    resources.wrapperSha256!==wrapperHash||
    !Number.isInteger(resources.postgresPort)||resources.postgresPort<1024||
    !Number.isInteger(resources.redisPort)||resources.redisPort<1024||
    resources.postgresPort===resources.redisPort||
    resources.ownedPostgresStopped!==true||resources.ownedRedisStopped!==true||
    resources.ownedApiStopped!==true||resources.ownedTemporaryDirectoryRemoved!==true||
    resources.existingChromePreserved!==true||resources.noProductionConnections!==true||
    resources.temporaryLocalhostOnly!==true)fail('MISSING_OWNED_RESOURCE_CLEANUP');
  let httpChecks=0;
  const byStep={};
  for(let index=0;index<expected.length;index++){
    const e=expected[index],x=evidence.steps[index],state=x?.browser;
    if(x?.step!==e.step||x.host!==e.host||x.origin!==origins[e.host]||
       !state||state.chrome!==true||state.userAgentVerified!==true||
       state.secFetchSite!=='same-origin'||state.documentCookieHasAuth!==false)
       fail('CHROME_ORIGIN_BROWSER_STATE_'+e.step);
    equal(x.sql,e.sql,'SQL_SESSION_STATE_'+e.step);
    if(x.sqlBrowserRefreshBinding?.owner!==e.bound||
       x.sqlBrowserRefreshBinding?.revoked!== (e.cookie==='none'?null:e.cookie==='revoked'))
       fail('COOKIE_SESSION_SQL_BINDING_'+e.step);
    if(!Array.isArray(x.http)||x.http.length!==e.http.length||
       !Array.isArray(state.requests)||state.requests.length!==e.http.length)
       fail('REAL_HTTP_COUNT_'+e.step);
    for(let k=0;k<e.http.length;k++){
      const [method,path,status]=e.http[k],wire=x.http[k],browser=state.requests[k];
      if(wire?.method!==method||wire.path!==path||wire.status!==status||
         wire.actorMatches!==true||browser?.method!==method||browser.path!==path||
         browser.status!==status||browser.identityCorrect!==true||browser.code!==wire.code||
         browser.success!==wire.success||
         (status===200&&wire.success!==true)||
         (status===401&&wire.success===true)||
         !Array.isArray(wire.setCookies))fail('CHROME_HTTP_WIRE_OR_IDENTITY_'+e.step+'_'+k);
      const createsCookies=['/auth/login','/auth/refresh'].includes(path)&&status===200;
      const clearsCookies=['/auth/logout','/auth/logout-all'].includes(path)&&status===200;
      if(createsCookies||clearsCookies)cookieAttributes(wire.setCookies,clearsCookies,e.step);
      else if(wire.setCookies.length!==0)fail('UNEXPECTED_AUTH_COOKIE_SET_'+e.step);
      httpChecks++;
    }
    cookieProbe(state.after,e.cookie!=='none',e.step+'_AFTER');
    if(state.after.access!==state.after.refresh)fail('ONLY_ONE_COOKIE_'+e.step);
    if(!state.before||typeof state.before.access!=='boolean'||
       state.before.access!==state.before.refresh)fail('INVALID_BEFORE_COOKIE_'+e.step);
    cookieProbe(state.before,state.before.access,e.step+'_BEFORE');
    byStep[e.step]=x;
  }
  if(httpChecks!==29)fail('HTTP_COUNT_EXPECTED_29');
  const fp=(step,when)=>byStep[step].browser[when].refreshFingerprint;
  for(const [a,af,b,bf] of [
    ['a_login','after','a_refresh','before'],
    ['a_refresh','after','a_logout','before'],
    ['c_login','after','c_after_single','before'],
    ['c_after_single','after','c_after_all','before'],
    ['c_after_all','after','c_cleanup','before'],
    ['b_login','after','b_after_single','before'],
    ['b_after_single','after','b_unaffected','before'],
    ['b_unaffected','after','b_cleanup','before'],
    ['a_relogin','after','a_logout_all','before']
  ])if(fp(a,af)!==fp(b,bf))fail('COOKIE_CROSS_STEP_CONTINUITY_'+a+'_'+b);
  for(const step of ['a_refresh','b_unaffected']){
    if(fp(step,'before')===fp(step,'after'))fail('REFRESH_COOKIE_NOT_ROTATED_'+step);
  }
  if(fp('a_login','after')===fp('b_login','after')||
     fp('a_login','after')===fp('c_login','after')||
     fp('b_login','after')===fp('c_login','after'))fail('CROSS_ORIGIN_COOKIE_COLLISION');
  // Critical proof: the second A tab still carries cookies, but Hono/SQL deny both
  // access and refresh; unrelated B retains HTTP 200 and rotates its refresh.
  const stale=byStep.c_after_all;
  if(!stale.browser.before.refresh||!stale.browser.after.refresh||
     stale.sqlBrowserRefreshBinding.revoked!==true||
     stale.http.some(x=>x.status!==401||!x.hadRefresh))
    fail('REVOKED_COOKIE_STILL_AUTHENTICATES_OR_WAS_NOT_PRESENT');
  const other=byStep.b_unaffected;
  if(other.sql.bActive!==1||other.http.some(x=>x.status!==200)||
     other.sqlBrowserRefreshBinding.owner!=='b')fail('OTHER_USER_SESSION_DAMAGED');
  for(const step of ['a_logout','a_logout_all','c_cleanup','b_cleanup'])
    if(byStep[step].browser.after.access||byStep[step].browser.after.refresh)
      fail('BROWSER_COOKIE_CLEANUP_FAILED_'+step);
  const raw=JSON.stringify(evidence);
  if(/eyJ[A-Za-z0-9_-]{80,}/.test(raw))fail('JWT_LEAK_IN_EVIDENCE');
  return {advisory:true,status:'measured-existing-chrome-isolated-qa',
    verifiedCases:expected.map(x=>({name:x.step,status:'passed'})),
    realBrowserHttpRequests:httpChecks,sqlSnapshots:expected.length,
    independentBrowserOrigins:3,syntheticUsers:2,refreshRotations:2,
    sameUserOtherSessionDeniedAfterLogoutAll:true,
    otherUserSessionPreserved:true,browserHttpOnlyCookieValuesUnreadable:true,
    resourceCleanupVerified:true,chromeExistingTabsPreserved:true,
    originalMountedHono:true,sourceFingerprintsVerified:true,
    note:'existing personal Chrome extension; temporary *.localhost origins, disposable real PG18 and Redis; informational only'};
}
