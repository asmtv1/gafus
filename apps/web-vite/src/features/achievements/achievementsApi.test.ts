import { withRejectedRefreshCookie } from "../../test/rejectedRefreshCookie";
import {afterEach,describe,expect,it,vi} from "vitest";
import {
  getOwnerAchievementStats,getOwnerTrainingDates,projectAchievementStats,
  projectTrainingDates,
} from "./achievementsApi";
const stats={
  totalCourses:3,completedCourses:1,inProgressCourses:2,totalCompletedDays:14,
  totalDays:50,overallProgress:28,totalTrainingTime:420,
  averageCourseProgress:29,longestStreak:7,currentStreak:3,
  lastUpdated:"2026-10-18T01:00:00.000Z",version:"1.0.0",
  privateUserId:"OWNER_PRIVATE",stripeAccount:"PRIVATE_PAYMENT",
  achievements:[{
    id:"first",title:"Первые шаги",description:"Успехи",icon:"🏆",
    unlocked:true,unlockedAt:"2026-10-18T01:00:00.000Z",
    progress:100,category:"progress",secret:"PRIVATE_S3",
  }],
};
const dates={dates:["2026-10-16T00:00:00.000Z","2026-10-17T00:00:00.000Z"],
  privatePhone:"SECRET_PHONE"};
afterEach(()=>vi.unstubAllGlobals());
describe("AG2 WEB-URL-005 existing Hono DTO projections",()=>{
  it("A01 stats removes unknown private metadata before query-cache",()=>{
    const parsed=projectAchievementStats(stats);
    expect(parsed.totalCourses).toBe(3);
    expect(parsed.achievements[0].unlocked).toBe(true);
    expect(JSON.stringify(parsed)).not.toMatch(/OWNER_PRIVATE|PRIVATE_|unlockedAt|lastUpdated/);
  });
  it("A02 Hono dates ISO projection no raw phone",()=>{
    const projected=projectTrainingDates(dates);
    expect(projected.dates).toHaveLength(2);
    expect(JSON.stringify(projected)).not.toContain("SECRET_PHONE");
  });
  it("A03 first-class zero statistics with empty achievements",()=>{
    expect(projectAchievementStats({
      ...stats,totalCourses:0,completedCourses:0,inProgressCourses:0,
      totalCompletedDays:0,totalDays:0,overallProgress:0,
      totalTrainingTime:0,averageCourseProgress:0,longestStreak:0,
      currentStreak:0,achievements:[],
    }).achievements).toEqual([]);
  });
  it.each([
    ["fraction",()=>projectAchievementStats({...stats,overallProgress:105})],
    ["negative",()=>projectAchievementStats({...stats,totalCourses:-1})],
    ["nan",()=>projectAchievementStats({...stats,currentStreak:"10"})],
    ["overflow",()=>projectAchievementStats({...stats,totalTrainingTime:Infinity})],
    ["completed>total",()=>projectAchievementStats({...stats,completedCourses:5})],
    ["duplicate",()=>projectAchievementStats({...stats,
      achievements:[stats.achievements[0],stats.achievements[0]]})],
    ["bad category",()=>projectAchievementStats({...stats,achievements:[
      {...stats.achievements[0],category:"payments"}]})],
    ["bad id",()=>projectAchievementStats({...stats,achievements:[
      {...stats.achievements[0],id:"../owner"}]})],
    ["bad progress",()=>projectAchievementStats({...stats,achievements:[
      {...stats.achievements[0],progress:-1}]})],
  ])("A04 invalid %s fails closed",(_name,call)=>expect(call).toThrow());
  it("A13 invalid/duplicated date fails closed",()=>{
    expect(()=>projectTrainingDates({dates:["2026-99-99T00:00:00.000Z"]}))
      .toThrow();
    expect(()=>projectTrainingDates({dates:["2026-10-18"]})).toThrow();
    expect(()=>projectTrainingDates({dates:[
      "2026-10-18T00:00:00.000Z","2026-10-18T00:00:00.000Z"]})).toThrow();
  });
  it("A14 GET stats uses exact Hono path, cookie auth, no POST",async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({success:true,data:stats}),
      {status:200}));
    vi.stubGlobal("fetch",withRejectedRefreshCookie(fetcher));
    const result=await getOwnerAchievementStats();
    expect(result.totalCourses).toBe(3);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/v1/achievements",
      expect.objectContaining({method:"GET",credentials:"include",cache:"no-store",
        headers:expect.objectContaining({"X-Gafus-Auth-Transport":"cookie"})}));
  });
  it("A15 GET training dates uses exact route, nothing persisted",async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({success:true,data:dates}),
      {status:200}));
    vi.stubGlobal("fetch",withRejectedRefreshCookie(fetcher));
    const result=await getOwnerTrainingDates();
    expect(result.dates).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/achievements/training-dates",
      expect.objectContaining({method:"GET",credentials:"include",cache:"no-store"}));
  });
  it.each([401,402,403,404,500])("A16 Hono %d cannot become stats",async(status)=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({
      success:false,error:"PRIVATE_BACKEND_MESSAGE",
    }),{status}));
    vi.stubGlobal("fetch",withRejectedRefreshCookie(fetcher));
    await expect(getOwnerAchievementStats()).rejects.toMatchObject({status});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
