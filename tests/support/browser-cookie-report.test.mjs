import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {verifyBrowserCookieReport} from './browser-cookie-report.mjs';
const root=resolve(import.meta.dirname,'../..');
const expected=JSON.parse(readFileSync(resolve(root,'tests/catalog/browser-cookie-cases.json'),'utf8')).cases;
const task={id:'api.browser-cookie.chrome-pg-redis',kind:'browser-cookie',expectedCases:expected.map(x=>x.step)};
const hash=path=>createHash('sha256').update(readFileSync(resolve(root,path),'utf8')).digest('hex');
const run='abcdef123456',port=44321;
const fp={a1:'aaaaaaaaaaaaaaaa',a2:'bbbbbbbbbbbbbbbb',a3:'cccccccccccccccc',b1:'dddddddddddddddd',b2:'eeeeeeeeeeeeeeee',c1:'ffffffffffffffff'};
const before={a_login:null,b_login:null,c_login:null,a_refresh:'a1',a_logout:'a2',
 c_after_single:'c1',b_after_single:'b1',a_relogin:null,a_logout_all:'a3',
 c_after_all:'c1',b_unaffected:'b1',c_cleanup:'c1',b_cleanup:'b2'};
const after={a_login:'a1',b_login:'b1',c_login:'c1',a_refresh:'a2',a_logout:null,
 c_after_single:'c1',b_after_single:'b1',a_relogin:'a3',a_logout_all:null,
 c_after_all:'c1',b_unaffected:'b2',c_cleanup:null,b_cleanup:null};
const probe=id=>({access:Boolean(id),refresh:Boolean(id),accessFingerprint:id?fp[id]:null,
 refreshFingerprint:id?fp[id]:null});
function cookies(method,path,status){
 if(status!==200||!['/auth/login','/auth/refresh','/auth/logout','/auth/logout-all'].includes(path))return [];
 return ['gafus_access','gafus_refresh'].map(name=>({name,httpOnly:true,sameSiteLax:true,path:true,
  secure:false,deleting:['/auth/logout','/auth/logout-all'].includes(path)}));
}
function fixture(){
 const db='archqa_cookie_112233aabbcc';
 const testReport={numPassedTests:13,numFailedTests:0,numPendingTests:0,
 testResults:[{name:resolve(root,'apps/api/src/test/qa-browser-cookie-server.mts'),
 assertionResults:expected.map(c=>({fullName:c.step,title:c.step,status:'passed'}))}]};
 const steps=expected.map(c=>{
   const origin=`http://qa-${c.host}-${run}.localhost:${port}`;
   const raw=c.http.map(([method,path,status])=>({method,path,status,code:null,
      success:status===200,actorMatches:true,
      hadAccess:Boolean(before[c.step]),hadRefresh:Boolean(before[c.step]),
      setCookies:cookies(method,path,status)}));
   return {step:c.step,host:c.host,origin,
     browser:{chrome:true,userAgentVerified:true,secFetchSite:'same-origin',documentCookieHasAuth:false,
     before:probe(before[c.step]),after:probe(after[c.step]),
     requests:raw.map(x=>({method:x.method,path:x.path,status:x.status,code:x.code,
       success:x.success,identityCorrect:true}))},
     http:raw,sql:{...c.sql},sqlBrowserRefreshBinding:{owner:c.bound,revoked:c.cookie==='none'?null:c.cookie==='revoked'}};
 });
 // A second Chrome tab still sent its revoked cookie after logout-all.
 for(const req of steps.find(x=>x.step==='c_after_all').http)req.hadRefresh=true;
 const sourcePaths={app:'apps/api/src/app.ts',cors:'apps/api/src/middleware/cors.ts',
   cookieAuth:'apps/api/src/lib/browser-auth.ts',driver:'apps/api/src/test/qa-browser-cookie-driver.js',
   runner:'apps/api/src/test/qa-browser-cookie-server.mts',cases:'tests/catalog/browser-cookie-cases.json'};
 const sourceHashes=Object.fromEntries(Object.entries(sourcePaths).map(([k,p])=>[k,hash(p)]));
 const evidence={schema:1,run,port,db,
   originHosts:['a','b','c'].map(x=>`qa-${x}-${run}.localhost`),
   browser:'existing-chrome-playwright-extension-default-context',
   connection:'loopback-original-mounted-hono-postgresql18-redis',sourceHashes,
   steps,received:13,finished:true};
 const resources={schema:1,database:db,postgresPort:44322,redisPort:44323,
   wrapperSha256:hash('scripts/qa/api-browser-cookie-isolated.sh'),
   ownedPostgresStopped:true,ownedRedisStopped:true,ownedApiStopped:true,
   ownedTemporaryDirectoryRemoved:true,existingChromePreserved:true,
   noProductionConnections:true,temporaryLocalhostOnly:true};
 return {testReport,evidence,resources};
}
const check=f=>verifyBrowserCookieReport(f.testReport,f.evidence,f.resources,task,root);
test('exact 13 named Chrome browser/HTTP/SQL cookie cases remain advisory only',()=>{
 const receipt=check(fixture());
 assert.equal(receipt.advisory,true);assert.equal(receipt.verifiedCases.length,13);
 assert.equal(receipt.realBrowserHttpRequests,29);assert.equal(receipt.sqlSnapshots,13);
 assert.equal(receipt.independentBrowserOrigins,3);assert.equal(receipt.resourceCleanupVerified,true);
});
test('forged logout-all SQL state or denied secondary cookie never counts as PASS',()=>{
 for(const modify of [
   f=>f.evidence.steps[8].sql.aActive=1,
   f=>f.evidence.steps[9].sqlBrowserRefreshBinding.revoked=false,
   f=>f.evidence.steps[9].browser.before=probe(null),
   f=>f.evidence.steps[9].http[0].status=200,
   f=>f.evidence.steps[10].http[1].status=401,
   f=>f.evidence.steps[10].sql.bActive=0,
 ]){const f=fixture();modify(f);assert.throws(()=>check(f),/BROWSER_COOKIE_QA_/)}
});
test('false HttpOnly, missing rotation, cross-origin cookie collision and altered source hashes are denied',()=>{
 for(const modify of [
   f=>f.evidence.steps[0].http[1].setCookies[0].httpOnly=false,
   f=>f.evidence.steps[3].browser.after=probe('a1'),
   f=>f.evidence.steps[1].browser.after=probe('a1'),
   f=>f.evidence.steps[7].browser.documentCookieHasAuth=true,
   f=>f.evidence.sourceHashes.cookieAuth='0'.repeat(64),
   f=>f.evidence.steps[2].origin='http://127.0.0.1:5173',
 ]){const f=fixture();modify(f);assert.throws(()=>check(f),/BROWSER_COOKIE_QA_/)}
});
test('skipped cases, missing cleanup and foreign disposable DB reject release-style proof',()=>{
 for(const modify of [
   f=>f.testReport.testResults[0].assertionResults[2].status='skipped',
   f=>f.evidence.steps.pop(),
   f=>f.resources.ownedRedisStopped=false,
   f=>f.resources.existingChromePreserved=false,
   f=>f.resources.database='archqa_cookie_badbadbadbad',
   f=>f.resources.wrapperSha256='f'.repeat(64),
 ]){const f=fixture();modify(f);assert.throws(()=>check(f),/BROWSER_COOKIE_QA_/)}
});
