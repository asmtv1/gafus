import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {verifyAccountDeleteWebReport} from './account-delete-web-report.mjs';
const root=resolve(import.meta.dirname,'../..');
const names=['owner_login','other_login','preflight','request_code','review_locked',
 'review_confirmed','deleted','stale_replay','other_isolated','owner_relogin_denied'];
const task={id:'api.account-delete.real-web-hono-sql',kind:'account-delete-web',expectedCases:names};
const sources=['apps/api/src/app.ts','apps/api/src/routes/v1/user.ts','apps/api/src/middleware/cors.ts',
 'apps/api/src/lib/browser-auth.ts','apps/api/src/test/qa-account-delete-web-server.mts',
 'apps/web-vite/src/features/profile/AccountDeleteConnected.tsx','apps/web-vite/vite.account-delete-qa.config.mjs',
 'packages/core/src/services/auth/transactionalAuthMail.ts'];
const sha=p=>createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex');
const baseSql={ownerExists:true,otherIntact:true,ownerPetCount:1,ownerDocumentCount:1,
 ownerQuestionCount:1,ownerFeedCount:1,otherPetIntact:true,otherFeedIntact:true,
 otherCommentIntact:true,ownerRefreshRows:1,ownerActiveRefresh:1,otherRefreshRows:1,
 otherActiveRefresh:1,ownerChallengeRows:1,auditCount:0,auditRole:null,
 auditInitiatedBy:null,auditHadEmail:null,auditHash:null,deletionCounter:0,
 pendingCleanupScopes:[],cleanupJobsNotExecuted:true};
const afterSql={...baseSql,ownerExists:false,ownerPetCount:0,ownerDocumentCount:0,
 ownerQuestionCount:0,ownerFeedCount:0,ownerRefreshRows:0,ownerActiveRefresh:0,
 ownerChallengeRows:0,auditCount:1,auditRole:'USER',auditInitiatedBy:'SELF_SERVICE',
 auditHadEmail:true,auditHash:'e'.repeat(64),deletionCounter:1,
 pendingCleanupScopes:['feed','gallery','public']};
const routeRows=[
 ['owner','GET','/auth/me',401],['owner','POST','/auth/refresh',401],['owner','POST','/auth/login',200],
 ['other','GET','/auth/me',401],['other','POST','/auth/refresh',401],['other','POST','/auth/login',200],
 ['owner','GET','/auth/me',200],['owner','GET','/user/account/deletion-preflight',200],
 ['owner','GET','/auth/me',200],['owner','GET','/user/account/deletion-preflight',200],
 ['owner','POST','/user/account/deletion-code',200],['owner','POST','/user/account/delete',200],
 ['owner','GET','/auth/me',401],['owner','POST','/auth/refresh',401],
 ['owner','GET','/auth/me',401],['owner','POST','/auth/refresh',401],
 ['owner','POST','/user/account/delete',401],
 ['other','GET','/auth/me',200],['other','POST','/auth/refresh',200],['other','GET','/auth/me',200],
 ['owner','POST','/auth/login',401],
 ['other','POST','/auth/logout',200],['other','GET','/auth/me',401],
 ['owner','POST','/auth/logout',200],['owner','GET','/auth/me',401],
];
const ui=[
 {url:'/courses',loggedIn:true},
 {url:'/courses',loggedIn:true},
 {url:'/profile/delete-account',realDeletePage:true,requestCodeEnabled:true,deleteButtonPresent:false},
 {mailFromIsolatedSink:true,codeInputPresent:true,continueDisabled:true},
 {reviewPresent:true,dangerDisabled:true,usernameEntered:'',consentChecked:false},
 {reviewPresent:true,dangerEnabled:true,usernameExact:true,consentChecked:true},
 {onLoginPage:true,confirmButtonGone:true},
 {meDenied:401,refreshDenied:401,repeatDeleteDenied:401},
 {otherStillAuthenticated:true,meAfterDeletion:200,refreshAfterDeletion:200,meAfterRotation:200},
 {invalidCredentialsAlert:true,stillOnLogin:true},
];
function fixture(){
 const run='abcd1234abcd',webPort=40421,apiPort=40422,db='archqa_delete_121212121212';
 const states=names.map((phase,i)=>({phase,role:i===1||i===8?'other':'owner',
   origin:`http://qa-delete-${i===1||i===8?'other':'owner'}-${run}.localhost:${webPort}`,
   browser:{...ui[i],jsCookieVisible:false},sql:i<6?{...baseSql}:{...afterSql},http:[]}));
 states[0].sql={...baseSql,otherRefreshRows:0,otherActiveRefresh:0,ownerChallengeRows:0};
 states[1].sql={...baseSql,ownerChallengeRows:0};
 states[2].sql={...baseSql,ownerChallengeRows:0};
 states[8].sql={...afterSql,otherRefreshRows:2,otherActiveRefresh:1};
 states[9].sql={...afterSql,otherRefreshRows:2,otherActiveRefresh:1};
 const wire=routeRows.map(([host,method,path,status])=>({host,method,path,status,
   success:status===200,code:null,cookiePresent:true,
   setCookies:status===200&&['/auth/login','/auth/refresh','/auth/logout'].includes(path)?
    ['gafus_access','gafus_refresh'].map(name=>({name,httpOnly:true,sameSiteLax:true,path:true,secure:false,delete:path==='/auth/logout'})):[]}));
 const evidence={schema:1,run,webPort,port:apiPort,db,
   origins:['owner','other'].map(role=>`http://qa-delete-${role}-${run}.localhost:${webPort}`),
   platform:'existing-Chrome-McpGo-Playwright-extension-original-Web-Vite-and-Hono',
   webUiSource:'apps/web-vite/src/features/profile/AccountDeleteConnected.tsx',
   mailMode:'isolated-qa-file-sink-no-external-smtp',
   sourceHash:Object.fromEntries(sources.map(p=>[p,sha(p)])),
   states,wire,finalSql:{...afterSql,otherRefreshRows:2,otherActiveRefresh:0}};
 const resources={schema:2,database:db,webPort,apiPort,postgresPort:40423,redisPort:40424,
   viteProcessId:43210,vitePidAbsentVerified:true,vitePortFreeVerified:true,
   viteLifecycleGuardSha256:sha('scripts/qa/owned-vite-process.mjs'),
   runnerSha256:sha('scripts/qa/api-account-delete-web-isolated.sh'),
   ownedPostgresStopped:true,ownedRedisStopped:true,ownedHonoStopped:true,ownedViteStopped:true,
   temporaryDirectoryRemoved:true,existingChromePreserved:true,noExternalMail:true,noProductionConnections:true};
 const tests={numPassedTests:10,numFailedTests:0,numPendingTests:0,
   testResults:[{name:resolve(root,'apps/api/src/test/qa-account-delete-web-server.mts'),
     assertionResults:names.map(name=>({fullName:name,title:name,status:'passed'}))}]};
 return {tests,evidence,resources};
}
const check=x=>verifyAccountDeleteWebReport(x.tests,x.evidence,x.resources,task,root);
test('original Web UI + Hono/SQL delete advisory receipts verify exact 10 browser phases',()=>{
 const a=check(fixture());assert.equal(a.cases.length,10);assert.equal(a.actualHttpResponses,25);
 assert.equal(a.sqlSnapshots,11);assert.equal(a.auditSingleRowPersistedUnchangedAcrossReplay,true);
});
test('forged delete approval, stale session accepted or foreign user harmed fail closed',()=>{
 for(const corrupt of [
  x=>x.evidence.states[4].browser.dangerDisabled=false,
  x=>x.evidence.states[5].browser.consentChecked=false,
  x=>x.evidence.wire[11].status=401,
  x=>x.evidence.wire[16].status=200,
  x=>x.evidence.states[7].sql.ownerExists=true,
  x=>x.evidence.states[8].sql.otherIntact=false,
  x=>x.evidence.states[8].sql.otherActiveRefresh=0,
 ]){const x=fixture();corrupt(x);assert.throws(()=>check(x),/QA_ACCOUNT_DELETE_EVIDENCE_/)}
});
test('audit mutation, duplicate audit/counter, missing cascade, premature deletion or physical cleanup lie fail closed',()=>{
 for(const corrupt of [
  x=>x.evidence.states[7].sql.auditHash='a'.repeat(64),
  x=>x.evidence.states[8].sql.auditCount=2,
  x=>x.evidence.states[9].sql.deletionCounter=2,
  x=>x.evidence.states[6].sql.ownerPetCount=1,
  x=>x.evidence.states[5].sql.auditCount=1,
  x=>x.evidence.finalSql.pendingCleanupScopes=[],
  x=>x.evidence.finalSql.cleanupJobsNotExecuted=false,
 ]){const x=fixture();corrupt(x);assert.throws(()=>check(x),/QA_ACCOUNT_DELETE_EVIDENCE_/)}
});
test('missing named case, altered source digest and unclean local resources fail closed',()=>{
 for(const corrupt of [
  x=>x.tests.testResults[0].assertionResults[1].status='skipped',
  x=>x.evidence.states.pop(),
  x=>x.evidence.sourceHash[sources[0]]='0'.repeat(64),
  x=>x.resources.schema=1, // legacy receipt claimed stopped without PID/port proof
  x=>x.resources.ownedViteStopped=false,
  x=>x.resources.vitePortFreeVerified=false,
  x=>x.resources.vitePidAbsentVerified=false,
  x=>x.resources.viteLifecycleGuardSha256='0'.repeat(64),
  x=>x.resources.ownedRedisStopped=false,
  x=>x.resources.runnerSha256='0'.repeat(64),
  x=>x.evidence.mailMode='external-smtp',
 ]){const x=fixture();corrupt(x);assert.throws(()=>check(x),/QA_ACCOUNT_DELETE_EVIDENCE_/)}
});
