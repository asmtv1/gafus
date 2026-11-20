/** Strict advisory verification of original Web UI, Hono and disposable SQL deletion. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const sourceFiles=['apps/api/src/app.ts','apps/api/src/routes/v1/user.ts',
 'apps/api/src/middleware/cors.ts','apps/api/src/lib/browser-auth.ts',
 'apps/api/src/test/qa-account-delete-web-server.mts',
 'apps/web-vite/src/features/profile/AccountDeleteConnected.tsx',
 'apps/web-vite/vite.account-delete-qa.config.mjs',
 'packages/core/src/services/auth/transactionalAuthMail.ts'];
const names=['owner_login','other_login','preflight','request_code','review_locked',
 'review_confirmed','deleted','stale_replay','other_isolated','owner_relogin_denied'];
const expectedWire=[
 ['owner','GET','/auth/me',401],['owner','POST','/auth/refresh',401],
 ['owner','POST','/auth/login',200],
 ['other','GET','/auth/me',401],['other','POST','/auth/refresh',401],
 ['other','POST','/auth/login',200],
 ['owner','GET','/auth/me',200],['owner','GET','/user/account/deletion-preflight',200],
 ['owner','GET','/auth/me',200],['owner','GET','/user/account/deletion-preflight',200],
 ['owner','POST','/user/account/deletion-code',200],
 ['owner','POST','/user/account/delete',200],
 ['owner','GET','/auth/me',401],['owner','POST','/auth/refresh',401],
 ['owner','GET','/auth/me',401],['owner','POST','/auth/refresh',401],
 ['owner','POST','/user/account/delete',401],
 ['other','GET','/auth/me',200],['other','POST','/auth/refresh',200],
 ['other','GET','/auth/me',200],
 ['owner','POST','/auth/login',401],
 ['other','POST','/auth/logout',200],['other','GET','/auth/me',401],
 ['owner','POST','/auth/logout',200],['owner','GET','/auth/me',401],
];
function fail(msg){throw Error('QA_ACCOUNT_DELETE_EVIDENCE_'+msg)}
function eq(a,b,msg){if(JSON.stringify(a)!==JSON.stringify(b))fail(msg)}
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const pre=x=>x.ownerExists===true&&x.otherIntact===true&&
  x.ownerPetCount===1&&x.ownerDocumentCount===1&&x.ownerQuestionCount===1&&x.ownerFeedCount===1&&
  x.otherPetIntact===true&&x.otherFeedIntact===true&&x.otherCommentIntact===true&&
  x.auditCount===0&&x.deletionCounter===0&&x.auditHash===null;
const post=x=>x.ownerExists===false&&x.otherIntact===true&&
  x.ownerPetCount===0&&x.ownerDocumentCount===0&&x.ownerQuestionCount===0&&x.ownerFeedCount===0&&
  x.otherPetIntact===true&&x.otherFeedIntact===true&&x.otherCommentIntact===true&&
  x.ownerRefreshRows===0&&x.ownerActiveRefresh===0&&x.ownerChallengeRows===0&&
  x.auditCount===1&&x.auditRole==='USER'&&x.auditInitiatedBy==='SELF_SERVICE'&&
  x.auditHadEmail===true&&/^[a-f0-9]{64}$/.test(x.auditHash??'')&&x.deletionCounter===1&&
  JSON.stringify(x.pendingCleanupScopes)===JSON.stringify(['feed','gallery','public'])&&
  x.cleanupJobsNotExecuted===true;
export function verifyAccountDeleteWebReport(test,evidence,resources,task,root){
 const cases=JSON.parse(readFileSync(resolve(root,'tests/catalog/account-delete-web-cases.json'),'utf8'));
 if(cases.schema!==1||cases.cases.length!==10||
    task?.id!=='api.account-delete.real-web-hono-sql'||task.kind!=='account-delete-web'||
    JSON.stringify(task.expectedCases)!==JSON.stringify(names)||
    JSON.stringify(cases.cases.map(x=>x.name))!==JSON.stringify(names))fail('UNREGISTERED_PLAN_OR_DRIFTED_CASES');
 if(!test||test.numPassedTests!==10||test.numFailedTests!==0||test.numPendingTests!==0||
    test.testResults?.length!==1||test.testResults[0]?.name!==resolve(root,'apps/api/src/test/qa-account-delete-web-server.mts')||
    JSON.stringify(test.testResults[0]?.assertionResults?.map(x=>[x.fullName,x.status]))!==
      JSON.stringify(names.map(x=>[x,'passed'])))fail('MISSING_OR_FAKE_TEST_RESULTS');
 if(!evidence||evidence.schema!==1||
    evidence.platform!=='existing-Chrome-McpGo-Playwright-extension-original-Web-Vite-and-Hono'||
    evidence.webUiSource!=='apps/web-vite/src/features/profile/AccountDeleteConnected.tsx'||
    evidence.mailMode!=='isolated-qa-file-sink-no-external-smtp'||
    !/^[a-f0-9]{12}$/.test(evidence.run??'')||
    !/^archqa_delete_[a-f0-9]{12}$/.test(evidence.db??'')||
    !Number.isInteger(evidence.webPort)||evidence.webPort<1024||evidence.webPort>65535||
    !Number.isInteger(evidence.port)||evidence.port<1024||evidence.port===evidence.webPort)
   fail('UNSAFE_TOPOLOGY');
 eq(evidence.origins,['owner','other'].map(x=>`http://qa-delete-${x}-${evidence.run}.localhost:${evidence.webPort}`),
   'FOREIGN_ORIGIN_NOT_SYNTHETIC');
 for(const path of sourceFiles){if(evidence.sourceHash?.[path]!==hash(resolve(root,path)))fail('SOURCE_HASH_MISMATCH_'+path)}
 if(!resources||resources.schema!==2||resources.database!==evidence.db||
    resources.webPort!==evidence.webPort||resources.apiPort!==evidence.port||
    !Number.isInteger(resources.postgresPort)||!Number.isInteger(resources.redisPort)||
    new Set([resources.postgresPort,resources.redisPort,resources.webPort,resources.apiPort]).size!==4||
    resources.runnerSha256!==hash(resolve(root,'scripts/qa/api-account-delete-web-isolated.sh'))||
    resources.viteLifecycleGuardSha256!==hash(resolve(root,'scripts/qa/owned-vite-process.mjs'))||
    !Number.isSafeInteger(resources.viteProcessId)||resources.viteProcessId<=1||
    resources.vitePidAbsentVerified!==true||resources.vitePortFreeVerified!==true||
    resources.ownedPostgresStopped!==true||resources.ownedRedisStopped!==true||
    resources.ownedHonoStopped!==true||resources.ownedViteStopped!==true||
    resources.temporaryDirectoryRemoved!==true||resources.existingChromePreserved!==true||
    resources.noExternalMail!==true||resources.noProductionConnections!==true)fail('RESOURCE_CLEANUP_NOT_PROVED');
 if(!Array.isArray(evidence.states)||evidence.states.length!==10||
    !Array.isArray(evidence.wire)||evidence.wire.length!==expectedWire.length)
   fail('INCOMPLETE_HTTP_BROWSER_SQL');
 for(let i=0;i<names.length;i++){
   const x=evidence.states[i],expected=cases.cases[i];
   if(x?.phase!==names[i]||x.role!==expected.role||x.origin!==evidence.origins[expected.role==='owner'?0:1]||
      !x.browser||!x.sql||!Array.isArray(x.http)||
      x.http.some(y=>y.host!==expected.role))fail('BROWSER_CASE_IDENTITY_'+names[i]);
   if(i<6?!pre(x.sql):!post(x.sql))fail('SQL_DELETE_OR_FOREIGN_BOUNDARY_'+names[i]);
   if(i<6&&x.sql.ownerChallengeRows!==(i<3?0:1))fail('EMAIL_CHALLENGE_SQL_SEQUENCE_'+names[i]);
 }
 const s=evidence.states;
 if(s[0].browser.loggedIn!==true||s[0].browser.url!=='/courses'||
    s[1].browser.loggedIn!==true||s[1].browser.url!=='/courses'||
    s[2].browser.realDeletePage!==true||s[2].browser.requestCodeEnabled!==true||
    s[2].browser.deleteButtonPresent!==false||
    s[3].browser.mailFromIsolatedSink!==true||s[3].browser.codeInputPresent!==true||
    s[3].browser.continueDisabled!==true||
    s[4].browser.reviewPresent!==true||s[4].browser.dangerDisabled!==true||
    s[4].browser.usernameEntered!==''||s[4].browser.consentChecked!==false||
    s[5].browser.reviewPresent!==true||s[5].browser.dangerEnabled!==true||
    s[5].browser.usernameExact!==true||s[5].browser.consentChecked!==true||
    s[6].browser.onLoginPage!==true||s[6].browser.confirmButtonGone!==true||
    s[7].browser.meDenied!==401||s[7].browser.refreshDenied!==401||
    s[7].browser.repeatDeleteDenied!==401||
    s[8].browser.otherStillAuthenticated!==true||s[8].browser.meAfterDeletion!==200||
    s[8].browser.refreshAfterDeletion!==200||s[8].browser.meAfterRotation!==200||
    s[9].browser.invalidCredentialsAlert!==true||s[9].browser.stillOnLogin!==true)
   fail('ORIGINAL_WEB_CONFIRMATION_OR_AUTH_OUTCOME_MISMATCH');
 for(const x of s)if(x.browser.jsCookieVisible===true||x.browser.documentCookieHasAuth===true)
   fail('HTTPONLY_EXPOSED_IN_BROWSER');
 if(s[0].sql.ownerRefreshRows!==1||s[0].sql.ownerActiveRefresh!==1||
    s[0].sql.otherRefreshRows!==0||s[0].sql.otherActiveRefresh!==0||
    s[1].sql.otherRefreshRows!==1||s[1].sql.otherActiveRefresh!==1||
    s[6].sql.otherActiveRefresh!==1||s[7].sql.otherActiveRefresh!==1||
    s[8].sql.otherRefreshRows!==2||s[8].sql.otherActiveRefresh!==1||
    s[9].sql.otherRefreshRows!==2||s[9].sql.otherActiveRefresh!==1)
    fail('CROSS_USER_SQL_REFRESH_SESSION_ISOLATION');
 const auditHash=s[6].sql.auditHash;
 for(const x of s.slice(7))if(x.sql.auditHash!==auditHash||x.sql.auditCount!==1||x.sql.deletionCounter!==1)
   fail('AUDIT_CHANGED_OR_DOUBLE_COUNTED_ON_REPLAY');
 const live=evidence.wire;
 for(let i=0;i<expectedWire.length;i++){
   const x=live[i];const [host,method,path,status]=expectedWire[i];
   if(x?.host!==host||x.method!==method||x.path!==path||x.status!==status||
      x.success!==(status===200)||!Array.isArray(x.setCookies))
     fail('HTTP_ROUTE_STATUS_DRIFT_'+i);
   const emit=['/auth/login','/auth/refresh','/auth/logout'].includes(path)&&status===200;
   if(emit){if(x.setCookies.length!==2||x.setCookies.some(c=>
       !['gafus_access','gafus_refresh'].includes(c.name)||c.httpOnly!==true||
       c.sameSiteLax!==true||c.path!==true||c.secure!==false))
       fail('COOKIE_ATTRIBUTES_NOT_ISOLATED');}
   else if(x.setCookies.length)fail('UNEXPECTED_SET_COOKIE_'+i);
 }
 if(live.filter(x=>x.path==='/user/account/delete'&&x.status===200).length!==1||
    live.filter(x=>x.path==='/user/account/delete'&&x.status===401).length!==1||
    live.filter(x=>x.path==='/user/account/deletion-code'&&x.status===200).length!==1)
   fail('DUPLICATE_DELETION_OR_MISSING_REAL_CODE');
 if(!evidence.finalSql||!post(evidence.finalSql)||evidence.finalSql.auditHash!==auditHash||
    evidence.finalSql.otherActiveRefresh!==0||evidence.finalSql.otherRefreshRows!==2)
   fail('FINAL_SQL_AUDIT_OR_COOKIE_CLEANUP_INCONSISTENT');
 return {advisory:true,status:'measured-original-Web-existing-Chrome-Hono-PG18-Redis',
   cases:names.map(name=>({name,status:'passed'})),
   actualHttpResponses:live.length,sqlSnapshots:s.length+1,
   originalWebUi:true,originalHonoApi:true,chromeUsers:2,
   separateCookieOrigins:2,realEmailCodeToSyntheticSink:true,
   explicitUsernameAndCheckboxConfirmed:true,
   revokedSessionAndRepeatDenied:true,otherUserUnaffected:true,
   ownerCascadedRowsDeleted:true,auditSingleRowPersistedUnchangedAcrossReplay:true,
   auditHash,cleanupJobsPending:['feed','gallery','public'],
   noPhysicalExternalStorageCleanupClaim:true,resourcesCleaned:true,
   note:'Audit row persisted and hash unchanged in sampled HTTP/SQL sequence; no DB UPDATE/DELETE prevention asserted.'};
}
