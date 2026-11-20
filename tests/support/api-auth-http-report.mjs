import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
/** Strict local original-Hono TCP + disposable SQL acceptance receipt. Informational, never release gate. */
export const API_HTTP_CASES=[
 'Anonymous and invalid bearer are denied by identity, private day, profile and admin API',
 'Invalid password returns HTTP 401 without SQL refresh session',
 'Four authenticated HTTP logins create distinct JWTs and four SQL refresh sessions',
 'Authenticated me and profile responses identify only the request owner',
 'Assigned private training day is HTTP 200; foreign learner is HTTP 403 without SQL progress',
 'USER denied trainer/admin, TRAINER allowed own days only, ADMIN permitted protected user list',
 'Foreign learner POST is denied; assigned learner POST persists exactly one bound SQL progress row',
 'Logout revokes refresh SQL session, denies bound access JWT, and rejects immediate refresh replay as HTTP 409',
 'Fresh login then logout-all invalidates bearer and every owner SQL refresh row but not another user',
];
const route=(p)=>p==='DAY'?'/training/day':p;
export const API_HTTP_EXPECTED_HTTP=[
 [['GET','/auth/me',401],['GET','/user/profile',401],['GET','DAY',401],['GET','/admin/users',401],['GET','/auth/me',401]],
 [['POST','/auth/login',401]],
 Array.from({length:4},()=>['POST','/auth/login',200]),
 Array.from({length:3},()=>[['GET','/auth/me',200],['GET','/user/profile',200]]).flat(),
 [['GET','DAY',200],['GET','DAY',403]],
 [['GET','/trainer/days',403],['GET','/admin/users',403],['GET','/admin/users',403],['GET','/trainer/days',200],['GET','/admin/users',200]],
 [['POST','/training/step/start',403],['POST','/training/step/start',200]],
 [['POST','/auth/logout',200],['POST','/auth/refresh',409],['GET','/auth/me',401]],
 [['POST','/auth/login',200],['GET','/auth/me',200],['POST','/auth/logout-all',200],['GET','/auth/me',401],['GET','/auth/me',200]],
];
export const API_HTTP_EXPECTED_SQL=[
 {http401:5,sqlSessions:0},
 {httpStatus:401,sqlSessions:0},
 {httpLogin200:4,sqlRefreshSessions:4,uniqueJwt:4},
 {httpOwnerIdentity200:3,httpOwnerProfile200:3,sqlActorRows:3},
 {httpOwnerDay:200,httpForeignDay:403,sqlCourseGrants:1,sqlTrainingProgress:0},
 {httpUserTrainerDenied:403,httpUserAdminDenied:403,httpTrainerAdminDenied:403,httpTrainerDays:200,httpAdminPanel:200,sqlRoles:3},
 {httpForeignDenied:403,httpOwnerStart:200,sqlOwnerProgress:1,sqlForeignProgress:0},
 {httpLogout:200,httpRefreshDenied:409,httpRevokedAccess:401,sqlRevokedSessions:1},
 {httpLogoutAll:200,httpOldJwtDenied:401,httpOtherUnaffected:200,sqlRevokedSessions:2,sqlRevokedTimestamp:true},
];
export function verifyApiHttpAcceptance(test, evidence, resources, task, root){
 if(task?.id!=='api.authenticated-http.pg'||task.kind!=='api-acceptance'||
   JSON.stringify(task.expectedCases)!==JSON.stringify(API_HTTP_CASES))
   throw Error('API_HTTP_QA_UNREGISTERED_OR_DRIFTED_CASES');
 if(!test||test.numPassedTests!==9||test.numFailedTests!==0||test.numPendingTests!==0||
    !Array.isArray(test.testResults)||test.testResults.length!==1||
    test.testResults[0]?.name!==root+'/apps/api/src/test/qa-authenticated-http.acceptance.mts'||
    JSON.stringify((test.testResults[0]?.assertionResults||[]).map(c=>({name:c.fullName,status:c.status})))!==
      JSON.stringify(API_HTTP_CASES.map(name=>({name,status:'passed'}))))
   throw Error('API_HTTP_QA_INVALID_NAMED_TEST_RECEIPT');
 if(!evidence||evidence.schema!==1||evidence.mode!=='real-mounted-hono-over-loopback-tcp-disposable-pg18-redis'||
    evidence.syntheticActors!==4||evidence.tests!==9||evidence.failedPhase!==null||
    !/^archqa_http_[a-f0-9]{12}$/.test(evidence.database??'')||
    !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(evidence.loopback??'')||
    JSON.stringify(evidence.cases)!==JSON.stringify(API_HTTP_CASES.map(name=>({name,status:'passed'})))||
    JSON.stringify(evidence.sql)!==JSON.stringify({expectedRefreshRows:5,expectedCourseGrants:1,
      expectedOwnerProgress:1,expectedForeignProgress:0}))
   throw Error('API_HTTP_QA_INVALID_SQL_OR_HTTP_SOURCE_RECEIPT');
 const sha=path=>createHash('sha256').update(readFileSync(join(root,path))).digest('hex');
 if(evidence.sourceSha256!==sha('apps/api/src/test/qa-authenticated-http.acceptance.mts')||
    evidence.honoAppSha256!==sha('apps/api/src/app.ts')||
    resources?.wrapperSha256!==sha('scripts/qa/api-authenticated-http-isolated.sh'))
   throw Error('API_HTTP_QA_SOURCE_HASH_CHANGED_SINCE_HTTP_SQL_PROOF');
 if(!resources||resources.schema!==1||resources.database!==evidence.database||
    !Number.isInteger(resources.postgresPort)||resources.postgresPort<1024||
    !Number.isInteger(resources.redisPort)||resources.redisPort<1024||
    resources.postgresPort===resources.redisPort||
    resources.ownedPostgresStopped!==true||resources.ownedRedisStopped!==true||
    resources.ownedApiStopped!==true||resources.ownedTemporaryDirectoryRemoved!==true||
    resources.otherProcessesUntouched!==true||resources.noProductionConnections!==true||
    resources.location!=='disposable-loopback-PostgreSQL18-Redis-Hono')
   throw Error('API_HTTP_QA_MISSING_OWNED_RESOURCE_CLEANUP');
 const observations=evidence.observations;
 if(!Array.isArray(observations)||observations.length!==9)
   throw Error('API_HTTP_QA_INCOMPLETE_CASE_OBSERVATIONS');
 let httpChecked=0;
 for(let i=0;i<9;i++){
   const item=observations[i],expected=API_HTTP_EXPECTED_HTTP[i];
   if(item?.name!==API_HTTP_CASES[i]||!Array.isArray(item.http)||item.http.length!==expected.length||
      JSON.stringify(item.sql)!==JSON.stringify(API_HTTP_EXPECTED_SQL[i]))
     throw Error('API_HTTP_QA_SQL_CASE_DRIFT_'+i);
   for(let k=0;k<expected.length;k++){
     const hit=item.http[k];const [method,path,status]=expected[k];
     if(hit?.method!==method||hit.status!==status||!Number.isInteger(hit.status)||
        typeof hit.path!=='string'||(path==='DAY'?
          !/^\/training\/day\?courseType=qahttp[a-f0-9]{10}&dayOnCourseId=[a-z0-9]+&createIfMissing=false$/.test(hit.path):hit.path!==path)||
        (hit.code!==null&&typeof hit.code!=='string'))
       throw Error('API_HTTP_QA_HTTP_CASE_DRIFT_'+i+'_'+k);
     if(i===4&&k===1&&hit.code!=='FORBIDDEN')throw Error('API_HTTP_QA_FOREIGN_FORBIDDEN_CODE_MISSING');
     if(i===5&&k===0&&hit.code!=='FORBIDDEN')throw Error('API_HTTP_QA_TRAINER_ROLE_DENIAL_MISSING');
     if(i===7&&k===1&&hit.code!=='REFRESH_CONFLICT')throw Error('API_HTTP_QA_REFRESH_REPLAY_CONFLICT_MISSING');
     httpChecked++;
   }
 }
 if(httpChecked!==33)throw Error('API_HTTP_QA_INCORRECT_HTTP_SCOPE');
 return {status:'passed-in-isolated-qa-only',advisory:true,checks:1,
   namedCases:API_HTTP_CASES.map(name=>({name,status:'passed'})),
   caseEvidence:observations.map(o=>({name:o.name,http:o.http.map(h=>({method:h.method,path:h.path,status:h.status,code:h.code})),sql:o.sql})),
   httpRequests:33,sqlCaseReceipts:9,
   actors:4,distinctInitialRefreshSessions:4,finalRefreshRows:5,
   privateCourseAssignments:1,ownerProgressRows:1,foreignProgressRows:0,
   resourcesCleaned:true,db:evidence.database,
   limitations:'real HTTP/TCP and PostgreSQL/Redis, synthetic users only; Prisma db push; no external providers or full CI release acceptance'};
}
