import {apiRequest} from "../../shared/api/client";

/** WEB-URL-005: Hono GET /achievements is OWNER-PRIVATE. Never expose as
 * /profile/public or use the DTO for someone else's achievements.
 * Next /achievements has a subscription gate: these consumers do NOT bypass
 * that gate; normal App must not use them until AG4 approves read integration.
 */
export type AchievementCategory="courses"|"progress"|"streak"|"social"|"special";
export type AchievementEntry={
  id:string;title:string;description:string;icon:string;unlocked:boolean;
  progress:number;category:AchievementCategory;
};
export type AchievementStats={
  totalCourses:number;completedCourses:number;inProgressCourses:number;
  totalCompletedDays:number;totalDays:number;overallProgress:number;
  totalTrainingTime:number;averageCourseProgress:number;
  longestStreak:number;currentStreak:number;achievements:AchievementEntry[];
};
export type TrainingDates={dates:string[]};
export type AchievementSnapshot={stats:AchievementStats;trainingDates:TrainingDates};
export type SyntheticAchievementTransport={
  fixtureKind:"AG2_ACHIEVEMENTS_OWNER_SYNTHETIC_ONLY"|"AG2_ACHIEVEMENTS_HONO_GET_ONLY";
  /** The harness supplies a real DTO-shaped synthetic GET, never writes. */
  stats:(req:{ownerId:string;method:"GET";path:"/api/v1/achievements"})=>Promise<unknown>;
  dates:(req:{ownerId:string;method:"GET";path:"/api/v1/achievements/training-dates"})=>Promise<unknown>;
};
const object=(v:unknown):Record<string,unknown>|null=>
  v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;
const int=(v:unknown):v is number=>
  typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=1_000_000_000;
const pct=(v:unknown):v is number=>
  typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=100;
const categories:AchievementCategory[]=["courses","progress","streak","social","special"];
const safeId=(v:unknown):v is string=>
  typeof v==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const bounded=(v:unknown,max:number):v is string=>
  typeof v==="string"&&v.length<=max;
export function projectAchievementStats(raw:unknown):AchievementStats{
  const v=object(raw);
  if(!v||!Array.isArray(v.achievements)||v.achievements.length>200)
    throw Error("ACHIEVEMENTS_DTO_INVALID");
  const counters=[
    "totalCourses","completedCourses","inProgressCourses",
    "totalCompletedDays","totalDays","totalTrainingTime",
    "longestStreak","currentStreak",
  ] as const;
  if(counters.some(key=>!int(v[key]))||
    !pct(v.overallProgress)||!pct(v.averageCourseProgress)||
    Number(v.completedCourses)>Number(v.totalCourses)||
    Number(v.currentStreak)>Number(v.longestStreak))
    throw Error("ACHIEVEMENT_STATS_INVALID");
  const ids=new Set<string>();
  const achievements:AchievementEntry[]=v.achievements.map((value:unknown)=>{
    const row=object(value);
    if(!row||!safeId(row.id)||ids.has(row.id)||
      !bounded(row.title,250)||!bounded(row.description,2000)||
      !bounded(row.icon,40)||typeof row.unlocked!=="boolean"||
      !pct(row.progress)||!categories.includes(row.category as AchievementCategory))
      throw Error("ACHIEVEMENT_ROW_INVALID");
    ids.add(row.id);
    return {id:row.id,title:row.title,description:row.description,
      icon:row.icon,unlocked:row.unlocked,progress:row.progress,
      category:row.category as AchievementCategory};
  });
  return {
    totalCourses:v.totalCourses as number,
    completedCourses:v.completedCourses as number,
    inProgressCourses:v.inProgressCourses as number,
    totalCompletedDays:v.totalCompletedDays as number,
    totalDays:v.totalDays as number,
    overallProgress:v.overallProgress as number,
    totalTrainingTime:v.totalTrainingTime as number,
    averageCourseProgress:v.averageCourseProgress as number,
    longestStreak:v.longestStreak as number,
    currentStreak:v.currentStreak as number,
    achievements,
  };
}
export function projectTrainingDates(raw:unknown):TrainingDates{
  const dto=object(raw);
  if(!dto||!Array.isArray(dto.dates)||dto.dates.length>5000)
    throw Error("TRAINING_DATES_DTO_INVALID");
  const seen=new Set<string>();
  const dates=dto.dates.map((item:unknown)=>{
    if(typeof item!=="string"||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(item)||
      !Number.isFinite(Date.parse(item))||
      new Date(item).toISOString()!==item||seen.has(item))
      throw Error("TRAINING_DATE_INVALID");
    seen.add(item);
    return item;
  });
  return {dates};
}
export async function getOwnerAchievementStats():Promise<AchievementStats>{
  const data=await apiRequest<unknown>("/api/v1/achievements",{
    method:"GET",browserAuth:true,expectedStatus:200,
  });
  return projectAchievementStats(data);
}
export async function getOwnerTrainingDates():Promise<TrainingDates>{
  const data=await apiRequest<unknown>("/api/v1/achievements/training-dates",{
    method:"GET",browserAuth:true,expectedStatus:200,
  });
  return projectTrainingDates(data);
}

/** Explicit opt-in ONLY: live registered Hono reads. Neither GET is an
 * entitlement token; the API checks subscription policy on EACH request. */
export const achievementsHonoRead: SyntheticAchievementTransport={
  fixtureKind:"AG2_ACHIEVEMENTS_HONO_GET_ONLY",
  stats:()=>getOwnerAchievementStats(),
  dates:()=>getOwnerTrainingDates(),
};
