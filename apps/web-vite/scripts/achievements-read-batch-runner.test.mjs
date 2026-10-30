import {test} from "node:test";
import assert from "node:assert/strict";
import {
 ACHIEVEMENT_SOURCE_PINS,ACHIEVEMENT_ALLOWED,
 achievementsFixture,achievementsSafeGet,exerciseAchievements,
 validateAchievementsGrant,
} from "./achievements-read-batch-runner.mjs";
const origin="http://127.0.0.1:4145";
const cookieA="ag2_achievements_ephemeral_A";
const cookieB="ag2_achievements_ephemeral_B";
const datesA=["2026-10-15T00:00:00.000Z"];
const datesB=["2026-10-16T00:00:00.000Z","2026-10-17T00:00:00.000Z"];
const fixture={
 principalA:"ag2achievementA20261018",
 principalB:"ag2achievementB20261018",
 totalCoursesA:1,totalCoursesB:2,
 datesA,datesB,
};
const stats=(total)=>({
 totalCourses:total,completedCourses:0,inProgressCourses:total,
 totalCompletedDays:0,totalDays:4,overallProgress:0,
 totalTrainingTime:0,averageCourseProgress:0,
 longestStreak:1,currentStreak:1,
 achievements:[{id:"progress_1",title:"Старт",description:"Вы начали курс",
  icon:"🏆",unlocked:true,progress:0,category:"progress",
  userId:"PRIVATE_USER",signedUrl:"SECRET_S3"}],
 token:"PRIVATE_TOKEN",
});
const res=data=>({status:200,json:async()=>({success:true,data})});
function fake(options={}){
 const requests=[];
 const transport=async(url,init)=>{
  assert.equal(init.method,"GET");
  assert.equal(init.redirect,"error");
  assert.equal(new URL(url).origin,origin);
  const who=init.headers.Cookie===cookieA?"A":init.headers.Cookie===cookieB?"B":"?";
  requests.push({who,path:new URL(url).pathname});
  if(options.badHTTP&&requests.length===1)return {status:403};
  if(options.badPayload&&requests.length===1)return res({achievements:[]});
  if(url.endsWith("/training-dates")){
   return res({dates:who==="A"?datesA:options.leakB?datesA:datesB,
    secret:"PRIVATE_PHONE"});
  }
  return res(stats(who==="A"?1:options.sameStats?1:2));
 };
 return {transport,requests};
}
test("A01 4 Hono GET and 4 owner-specific boolean checks",async()=>{
 const wire=fake();
 const result=await exerciseAchievements({origin,cookieA,cookieB,
  fixture,transport:wire.transport});
 assert.equal(result.pass,true);
 assert.equal(result.getCount,4);
 assert.equal(result.checksCount,4);
 assert.equal(result.writes,0);
 assert.deepEqual(wire.requests.map(x=>x.who),["A","A","B","B"]);
 assert.deepEqual(wire.requests.map(x=>x.path),[
  "/api/v1/achievements",
  "/api/v1/achievements/training-dates",
  "/api/v1/achievements",
  "/api/v1/achievements/training-dates"]);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|SECRET_|ag2achievement|datesA/);
});
test("A02 no lease means no network",async()=>{
 const wire=fake();
 await assert.rejects(exerciseAchievements({
  origin,cookieA,cookieB,fixture,transport:wire.transport,
  leaseCheck:()=>false}));
 assert.equal(wire.requests.length,0);
});
test("A03 403 cannot become empty achievements",async()=>{
 await assert.rejects(exerciseAchievements({
  origin,cookieA,cookieB,fixture,transport:fake({badHTTP:true}).transport}));
});
test("A04 invalid/missing stats fail closed",async()=>{
 await assert.rejects(exerciseAchievements({
  origin,cookieA,cookieB,fixture,transport:fake({badPayload:true}).transport}));
});
test("A05 owner B stats must be distinct",async()=>{
 await assert.rejects(exerciseAchievements({
  origin,cookieA,cookieB,fixture,transport:fake({sameStats:true}).transport}));
});
test("A06 B dates cannot leak A history",async()=>{
 await assert.rejects(exerciseAchievements({
  origin,cookieA,cookieB,fixture,transport:fake({leakB:true}).transport}));
});
test("A07 fixture enforces synthetic actor and distinct dates",()=>{
 assert.equal(achievementsFixture(fixture),fixture);
 assert.throws(()=>achievementsFixture({...fixture,principalA:"production"}));
 assert.throws(()=>achievementsFixture({...fixture,principalB:fixture.principalA}));
 assert.throws(()=>achievementsFixture({...fixture,datesB:datesA}));
 assert.throws(()=>achievementsFixture({...fixture,datesA:["BAD_DATE"]}));
});
test("A08 no external Origin or prohibited path",()=>{
 assert.equal(achievementsSafeGet(origin,ACHIEVEMENT_ALLOWED[0].slice(4),
  cookieA).init.method,"GET");
 assert.throws(()=>achievementsSafeGet("https://example.com",
  "/api/v1/achievements",cookieA));
 assert.throws(()=>achievementsSafeGet(origin,"/api/v1/training/step/start",cookieA));
 assert.throws(()=>achievementsSafeGet(origin,"/api/v1/achievements?userId=other",cookieA));
 assert.throws(()=>achievementsSafeGet(origin,"/api/v1/achievements","BAD\rCOOKIE"));
});
test("A09 same A and B cookies are forbidden",async()=>{
 const wire=fake();
 await assert.rejects(exerciseAchievements({origin,cookieA,cookieB:cookieA,
  fixture,transport:wire.transport}));
 assert.equal(wire.requests.length,0);
});
test("A10 Feed/Walet grant is not an achievements grant",()=>{
 assert.ok(ACHIEVEMENT_SOURCE_PINS.length>=11);
 assert.equal(ACHIEVEMENT_ALLOWED.length,2);
 assert.throws(()=>validateAchievementsGrant({
  kind:"AG4_AG2_FEED_AUTHOR_REAL_GET_EXCLUSIVE_GRANT_V1",
  state:"ACTIVE_AG2_EXCLUSIVE"}));
 assert.throws(()=>validateAchievementsGrant({
  kind:"AG4_AG2_ACHIEVEMENTS_REAL_GET_EXCLUSIVE_GRANT_V1",
  state:"ACTIVE_AG2_EXCLUSIVE",isolatedRedisRateLimiterVerifiedByAG4:false}));
});
test("A11 mismatched stats category or duplicate achievements denied",async()=>{
 const wire=fake();
 const transport=async(url,init)=>{
  if(url.endsWith("/training-dates"))return wire.transport(url,init);
  return res({...stats(init.headers.Cookie===cookieA?1:2),
   achievements:[{...stats(1).achievements[0],category:"owner_private"}]});
 };
 await assert.rejects(exerciseAchievements({origin,cookieA,cookieB,fixture,transport}));
});
test("A12 A or B cookies do not get logged on denied status",async()=>{
 const wire=fake({badHTTP:true});
 await assert.rejects(exerciseAchievements({origin,cookieA,cookieB,
  fixture,transport:wire.transport}),err=>
  !String(err).includes(cookieA)&&!String(err).includes(cookieB));
});


test("A13 test-only in-memory limiter is allowed only with paired AG1/AG4 review",()=>{
 // Everything else in this deliberately minimal grant is absent, so it
 // must still fail closed even when both isolated limiter claims are true.
 assert.throws(()=>validateAchievementsGrant({
  kind:"AG4_AG2_ACHIEVEMENTS_REAL_GET_EXCLUSIVE_GRANT_V1",
  state:"ACTIVE_AG2_EXCLUSIVE",
  isolatedRedisRateLimiterVerifiedByAG4:false,
  testOnlyInMemoryLimiterApprovedByAG4:true,
 }));
});
