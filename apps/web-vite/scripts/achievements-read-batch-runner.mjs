#!/usr/bin/env node
/** AG2-READ-ACHIEVEMENTS-005-001. Owner A/B GET-only integration.
 * Existing Hono rate limiter writes to Redis. A real grant MUST show
 * isolated PostgreSQL AND Redis, subscription parity, verified AG1 runtime.
 * Logs only booleans; no raw stats/IDs/dates/session/cookies.
 */
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFileSync,lstatSync,realpathSync} from "node:fs";
import {resolve,sep} from "node:path";
import {fileURLToPath} from "node:url";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const denied=()=>{throw Error("AG2_ACHIEVEMENTS_GATED_READ_DENIED");};
const assert=(value)=>{if(!value)denied();};
const id=/^[A-Za-z0-9_-]{1,128}$/;
const iso=(v)=>typeof v==="string"&&
 /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&
 Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const whole=(v)=>Number.isSafeInteger(v)&&v>=0&&v<=1e9;
const pct=(v)=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=100;
export const ACHIEVEMENT_SOURCE_PINS=[
 "apps/web-vite/scripts/achievements-read-batch-runner.mjs",
 "apps/web-vite/src/features/achievements/achievementsApi.ts",
 "apps/web-vite/src/features/achievements/achievementsApi.test.ts",
 "apps/web-vite/src/features/achievements/AchievementsOptIn.tsx",
 "apps/web-vite/migration/AG2_WEB_URL005_ACHIEVEMENTS_SOURCE_EVIDENCE_20261018.json",
 "apps/api/src/routes/v1/achievements.ts",
 "apps/api/src/middleware/rate-limit.ts",
 "apps/api/src/middleware/auth.ts",
 "packages/core/src/services/achievements/statsService.ts",
 "packages/core/src/services/achievements/datesService.ts",
 "packages/types/src/data/achievements.ts",
 "apps/web/src/app/(main)/achievements/page.tsx",
];
export const ACHIEVEMENT_ALLOWED=[
 "GET /api/v1/achievements",
 "GET /api/v1/achievements/training-dates",
];
function pathOwned(p){
 assert(typeof p==="string"&&/^(apps\/|packages\/)/.test(p)&&
  !p.includes("\\")&&p.split("/").every(x=>x&&x!==".."&&x!=="."));
 const full=resolve(ROOT,p);
 assert(full.startsWith(ROOT+sep));
 let part=ROOT;
 for(const component of p.split("/")){
  part=resolve(part,component);assert(!lstatSync(part).isSymbolicLink());
 }
 assert(realpathSync(full)===full);
 return full;
}
const digest=(p)=>createHash("sha256").update(readFileSync(pathOwned(p))).digest("hex");
export function achievementsFixture(f){
 assert(f&&typeof f==="object"&&!Array.isArray(f));
 assert(typeof f.principalA==="string"&&
  typeof f.principalB==="string"&&
  id.test(f.principalA)&&id.test(f.principalB)&&
  f.principalA.startsWith("ag2achievement")&&
  f.principalB.startsWith("ag2achievement")&&f.principalA!==f.principalB);
 assert(whole(f.totalCoursesA)&&whole(f.totalCoursesB)&&
  f.totalCoursesA!==f.totalCoursesB);
 assert(Array.isArray(f.datesA)&&Array.isArray(f.datesB)&&
  f.datesA.length<=5000&&f.datesB.length<=5000&&
  f.datesA.every(iso)&&f.datesB.every(iso)&&
  new Set(f.datesA).size===f.datesA.length&&
  new Set(f.datesB).size===f.datesB.length);
 assert(JSON.stringify(f.datesA)!==JSON.stringify(f.datesB));
 return f;
}
export function achievementsSafeGet(origin,path,cookie){
 assert(typeof origin==="string"&&
  /^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(origin));
 assert(path==="/api/v1/achievements"||
  path==="/api/v1/achievements/training-dates");
 assert(typeof cookie==="string"&&cookie.length>=16&&
  !/[\r\n]/.test(cookie));
 const url=new URL(path,origin);
 assert(url.origin===origin);
 return {url:url.href,init:{
  method:"GET",cache:"no-store",redirect:"error",
  headers:{Accept:"application/json",Cookie:cookie},
  signal:AbortSignal.timeout(8000),
 }};
}
function checkStats(d,expectedTotal){
 assert(d&&typeof d==="object"&&!Array.isArray(d)&&
  d.totalCourses===expectedTotal&&
  whole(d.completedCourses)&&whole(d.inProgressCourses)&&
  whole(d.totalCompletedDays)&&whole(d.totalDays)&&
  whole(d.totalTrainingTime)&&whole(d.longestStreak)&&
  whole(d.currentStreak)&&d.currentStreak<=d.longestStreak&&
  d.completedCourses<=d.totalCourses&&
  pct(d.overallProgress)&&pct(d.averageCourseProgress)&&
  Array.isArray(d.achievements)&&d.achievements.length<=200);
 const ids=new Set();
 for(const item of d.achievements){
  assert(item&&typeof item==="object"&&
   typeof item.id==="string"&&id.test(item.id)&&!ids.has(item.id)&&
   typeof item.title==="string"&&item.title.length<=250&&
   typeof item.description==="string"&&item.description.length<=2000&&
   typeof item.icon==="string"&&item.icon.length<=40&&
   typeof item.unlocked==="boolean"&&pct(item.progress)&&
   ["courses","progress","streak","social","special"].includes(item.category));
  ids.add(item.id);
 }
}
function checkDates(d,expectedDates){
 assert(d&&typeof d==="object"&&!Array.isArray(d)&&Array.isArray(d.dates)&&
  d.dates.length===expectedDates.length&&
  d.dates.every((v,i)=>iso(v)&&v===expectedDates[i]));
}
export async function exerciseAchievements({
 origin,cookieA,cookieB,fixture,transport=fetch,leaseCheck=()=>true,
}){
 achievementsFixture(fixture);assert(cookieA!==cookieB);
 const cases=[];
 const read=async(p,cookie)=>{
  assert(leaseCheck());
  const {url,init}=achievementsSafeGet(origin,p,cookie);
  const response=await transport(url,init);
  assert(response&&response.status===200);
  const body=await response.json();
  assert(body&&body.success===true&&body.data&&typeof body.data==="object");
  return body.data;
 };
 checkStats(await read("/api/v1/achievements",cookieA),fixture.totalCoursesA);
 cases.push({case:"ACHIEVEMENTS_OWNER_A_STATS",pass:true});
 checkDates(await read("/api/v1/achievements/training-dates",cookieA),fixture.datesA);
 cases.push({case:"ACHIEVEMENTS_OWNER_A_DATES",pass:true});
 checkStats(await read("/api/v1/achievements",cookieB),fixture.totalCoursesB);
 cases.push({case:"ACHIEVEMENTS_OWNER_B_DISTINCT_STATS",pass:true});
 checkDates(await read("/api/v1/achievements/training-dates",cookieB),fixture.datesB);
 cases.push({case:"ACHIEVEMENTS_OWNER_B_DISTINCT_DATES",pass:true});
 return {kind:"AG2_ACHIEVEMENTS_REAL_HONO_GET4_V1",pass:true,realHono:true,
  getCount:4,checksCount:cases.length,writes:0,methods:["GET"],cases};
}
export function validateAchievementsGrant(grant,now=Date.now()){
 assert(realpathSync(ROOT)===ROOT);
 assert(execFileSync("git",["-C",ROOT,"rev-parse","--show-toplevel"],
  {encoding:"utf8"}).trim()===ROOT);
 assert(execFileSync("git",["-C",ROOT,"branch","--show-current"],
  {encoding:"utf8"}).trim()==="vite");
 assert(grant?.kind==="AG4_AG2_ACHIEVEMENTS_REAL_GET_EXCLUSIVE_GRANT_V1"&&
  grant.state==="ACTIVE_AG2_EXCLUSIVE"&&grant.owner==="AG2"&&
  grant.issuer==="AG4"&&grant.repo===ROOT&&grant.branch==="vite"&&
  grant.batch==="AG2-READ-ACHIEVEMENTS-005-001"&&
  grant.exclusiveLeaseConfirmed===true&&
  grant.syntheticActorsConfirmed===true&&
  grant.ag1CurrentProducerAccepted===true&&
  grant.readOnlyPGVerifiedByAG1===true&&
  (grant.isolatedRedisRateLimiterVerifiedByAG4===true||
   grant.testOnlyInMemoryLimiterApprovedByAG4===true)&&
  grant.subscriptionGateVerifiedByAG1===true&&
  grant.readOnlyRoleConfirmedByAG4===true&&
  grant.databaseName==="gafus_ag2_achievements_read_20261018"&&
  grant.readOnlyPgRole==="ag2_achievements_read_20261018"&&
  Array.isArray(grant.operations)&&grant.operations.length===2&&
  ACHIEVEMENT_ALLOWED.every(op=>grant.operations.includes(op)));
 const expires=Date.parse(grant.expiresUTC);
 assert(Number.isFinite(expires)&&expires>now+10000&&expires<=now+30*60*1000);
 assert(grant.pin&&ACHIEVEMENT_SOURCE_PINS.every(p=>grant.pin[p]===digest(p)));
 assert(typeof grant.ag1ProducerReady==="string"&&
  grant.ag1ProducerReady.startsWith("apps/api/")&&
  grant.ag1ProducerReadySHA256===digest(grant.ag1ProducerReady));
 const ready=JSON.parse(readFileSync(pathOwned(grant.ag1ProducerReady),"utf8"));
 assert(ready.kind==="AG1_AG2_ACHIEVEMENTS_READ_PRODUCER_READY_V1"&&
  ready.state==="READY_FOR_AG2_ACHIEVEMENTS_GATED_READ"&&
  ready.origin===grant.honoOrigin&&
  ready.pgReadOnlyVerified===true&&
  (ready.redisIsolationVerified===true||
   ready.testOnlyInMemoryLimiterReviewedByAG1===true)&&
  ready.subscriptionGateVerified===true);
 assert(grant.testOnlyInMemoryLimiterApprovedByAG4!==true||
  ready.testOnlyInMemoryLimiterReviewedByAG1===true);
 assert(grant.isolatedRedisRateLimiterVerifiedByAG4!==true||
  ready.redisIsolationVerified===true);
 achievementsFixture(grant.syntheticFixture);
 assert(typeof grant.honoOrigin==="string"&&
  /^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(grant.honoOrigin));
 return {origin:grant.honoOrigin,fixture:grant.syntheticFixture,expires};
}
async function real(){
 assert(process.env.AG2_ACHIEVEMENTS_REAL_GET==="AG4_SCOPE_ACKNOWLEDGED"&&
  typeof process.env.AG2_ACHIEVEMENTS_COOKIE_A==="string"&&
  typeof process.env.AG2_ACHIEVEMENTS_COOKIE_B==="string");
 const grant=JSON.parse(readFileSync(pathOwned(
  "apps/admin-panel/AG4_AG2_ACHIEVEMENTS_REAL_GET_EXCLUSIVE_GRANT_ACTIVE_20261018.v1.json"),"utf8"));
 const params=validateAchievementsGrant(grant);
 return exerciseAchievements({origin:params.origin,fixture:params.fixture,
  cookieA:process.env.AG2_ACHIEVEMENTS_COOKIE_A,
  cookieB:process.env.AG2_ACHIEVEMENTS_COOKIE_B,
  leaseCheck:()=>Date.now()+1000<params.expires});
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.length!==4||process.argv[2]!=="--real"||
  process.argv[3]!=="--I-ACKNOWLEDGE-AG4-READONLY-ACHIEVEMENTS-LEASE"){
  process.stderr.write("AG2_ACHIEVEMENTS_READ_NO_GRANT\n");process.exitCode=78;
 }else{
  try{console.log(JSON.stringify(await real(),null,2));}
  catch{
   process.stderr.write("AG2_ACHIEVEMENTS_READ_DENIED_NO_FALLBACK\n");
   process.exitCode=78;
  }
 }
}
