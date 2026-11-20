import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {API_HTTP_CASES,API_HTTP_EXPECTED_HTTP,API_HTTP_EXPECTED_SQL,verifyApiHttpAcceptance} from './api-auth-http-report.mjs';
const root=resolve(import.meta.dirname,'../..');
const sha=p=>createHash('sha256').update(readFileSync(join(root,p))).digest('hex');
const task={id:'api.authenticated-http.pg',kind:'api-acceptance',expectedCases:API_HTTP_CASES};
function fixture(){
 const database='archqa_http_aabbccddeeff';
 const caseRows=API_HTTP_CASES.map(name=>({name,status:'passed'}));
 const observations=API_HTTP_EXPECTED_HTTP.map((rows,i)=>({name:API_HTTP_CASES[i],
   http:rows.map(([method,path,status],k)=>({method,status,
     path:path==='DAY'?'/training/day?courseType=qahttp1234567890&dayOnCourseId=cmabc012345&createIfMissing=false':path,
     code:i===4&&k===1||i===5&&k===0?'FORBIDDEN':i===7&&k===1?'REFRESH_CONFLICT':null})),
   sql:{...API_HTTP_EXPECTED_SQL[i]}}));
 const tests={numPassedTests:9,numFailedTests:0,numPendingTests:0,testResults:[{
   name:root+'/apps/api/src/test/qa-authenticated-http.acceptance.mts',
   assertionResults:API_HTTP_CASES.map(name=>({fullName:name,title:name,status:'passed'}))}]};
 const evidence={schema:1,sourceSha256:sha('apps/api/src/test/qa-authenticated-http.acceptance.mts'),
   honoAppSha256:sha('apps/api/src/app.ts'),
   mode:'real-mounted-hono-over-loopback-tcp-disposable-pg18-redis',database,
   loopback:'http://127.0.0.1:37412',syntheticActors:4,tests:9,
   failedPhase:null,cases:caseRows,observations,
   sql:{expectedRefreshRows:5,expectedCourseGrants:1,expectedOwnerProgress:1,expectedForeignProgress:0}};
 const resources={schema:1,database,postgresPort:37512,redisPort:37513,
   wrapperSha256:sha('scripts/qa/api-authenticated-http-isolated.sh'),
   ownedPostgresStopped:true,ownedRedisStopped:true,ownedApiStopped:true,
   ownedTemporaryDirectoryRemoved:true,otherProcessesUntouched:true,noProductionConnections:true,
   location:'disposable-loopback-PostgreSQL18-Redis-Hono'};
 return {tests,evidence,resources};
}
const check=f=>verifyApiHttpAcceptance(f.tests,f.evidence,f.resources,task,root);
test('strict HTTP/SQL acceptance proof is informational only with all nine real routes/counters named',()=>{
 const r=check(fixture());assert.equal(r.advisory,true);assert.equal(r.httpRequests,33);
 assert.equal(r.sqlCaseReceipts,9);assert.equal(r.namedCases.length,9);assert.equal(r.resourcesCleaned,true);
});
test('altered authorization status, foreign progress mutation and missing SQL receipt reject report',()=>{
 for(const mutate of [
   f=>f.evidence.observations[4].http[1].status=200,
   f=>f.evidence.observations[6].sql.sqlForeignProgress=1,
   f=>f.evidence.observations[6].sql.sqlOwnerProgress=0,
   f=>f.evidence.observations.pop(),
   f=>f.evidence.observations[7].http[1].code='TOKEN_REUSE_DETECTED',
 ]){const f=fixture();mutate(f);assert.throws(()=>check(f),/API_HTTP_QA_/)}
});
test('missing cleanup, changed source, foreign DB, duplicate/skipped case and wrong source fail closed',()=>{
 for(const mutate of [
   f=>f.resources.ownedRedisStopped=false,
   f=>f.resources.ownedApiStopped=false,
   f=>f.resources.database='archqa_http_deadbeefdead',
   f=>f.resources.wrapperSha256='f'.repeat(64),
   f=>f.evidence.sourceSha256='0'.repeat(64),
   f=>f.tests.testResults[0].assertionResults[2].fullName=API_HTTP_CASES[0],
   f=>f.tests.testResults[0].assertionResults[8].status='skipped',
   f=>f.tests.testResults[0].name='/tmp/foreign.mts',
 ]){const f=fixture();mutate(f);assert.throws(()=>check(f),/API_HTTP_QA_/)}
});
