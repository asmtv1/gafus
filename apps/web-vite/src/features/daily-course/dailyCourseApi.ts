import {apiRequest} from "../../shared/api/client";
import {safeStepMediaUrl,type TrainingStepPreview} from "../training/trainingDayApi";
import type {DailyCourseDayWire,DailyCourseDayStepWire} from "@gafus/types";

/** Hono GET /api/v1/daily-course/today + Core TodayDailyCourseResponse.
 * mskDate is authoritative Moscow calendar date: never use local client date.
 */
export type DailyToday={
  mskDate:string;
  scheduleId:string|null;
  userStatus:TrainingStepPreview["status"];
  day:null|{
    id:string;title:string;description:string;type:string;
    estimatedDuration:number;theoryMinutes:number;stepsCount:number;
  };
  stepsSummary:{total:number;completed:number};
};
/** Sanitized Web day projection: keep the existing flat TrainingStepPreview,
 * not the canonical nested Hono user-step DTO or its private/media fields.
 */
export type DailyDay=Pick<DailyCourseDayWire,
  "scheduleId"|"mskDate"|"trainingDayId"|"bundleId"|
  "title"|"description"|"type"
> & {
  userStatus:`${DailyCourseDayWire["userStatus"]}`;
  steps:(TrainingStepPreview & {
    status:`${DailyCourseDayStepWire["status"]}`;
  })[];
};
const obj=(v:unknown):Record<string,unknown>|null=>
  v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;
const safeId=(v:unknown):v is string=>
  typeof v==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const string=(v:unknown):v is string=>typeof v==="string";
const count=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const status=(v:unknown):v is TrainingStepPreview["status"]=>
  ["NOT_STARTED","IN_PROGRESS","COMPLETED","PAUSED","RESET"].includes(String(v));
const stepType=(v:unknown):v is TrainingStepPreview["type"]=>
  ["TRAINING","PRACTICE","THEORY","BREAK","EXAMINATION","SURVEY"].includes(String(v));
function mskDate(v:unknown):v is string{
  if(typeof v!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v))return false;
  const n=new Date(v+"T00:00:00.000Z");
  return !Number.isNaN(n.getTime())&&n.toISOString().slice(0,10)===v;
}
export function projectDailyToday(raw:unknown):DailyToday{
  const d=obj(raw);
  if(!d||!mskDate(d.mskDate)||!status(d.userStatus)||
    !(d.scheduleId===null||safeId(d.scheduleId)))throw Error("INVALID_DAILY_TODAY");
  const summary=obj(d.stepsSummary);
  if(!summary||!count(summary.total)||!count(summary.completed)||
    Number(summary.completed)>Number(summary.total))throw Error("INVALID_DAILY_SUMMARY");
  if(d.scheduleId===null){
    if(d.day!==null||summary.total!==0||summary.completed!==0)
      throw Error("INVALID_DAILY_EMPTY");
    return {mskDate:d.mskDate,scheduleId:null,userStatus:d.userStatus,day:null,
      stepsSummary:{total:0,completed:0}};
  }
  const day=obj(d.day);
  if(!day||!safeId(day.id)||!string(day.title)||!day.title.trim()||
    !string(day.description)||!string(day.type)||!count(day.estimatedDuration)||
    !count(day.theoryMinutes)||!count(day.stepsCount)||
    day.stepsCount!==summary.total)
    throw Error("INVALID_DAILY_DAY");
  return {
    mskDate:d.mskDate,scheduleId:d.scheduleId,userStatus:d.userStatus,
    day:{id:day.id,title:day.title,description:day.description,
      type:day.type,estimatedDuration:day.estimatedDuration,
      theoryMinutes:day.theoryMinutes,stepsCount:day.stepsCount},
    stepsSummary:{total:summary.total,completed:summary.completed},
  };
}
export function projectDailyDay(raw:unknown,expected:DailyToday):DailyDay{
  if(!expected.scheduleId||!expected.day)throw Error("DAILY_NOT_AVAILABLE");
  const d=obj(raw);
  if(!d||!safeId(d.scheduleId)||d.scheduleId!==expected.scheduleId||
    !mskDate(d.mskDate)||d.mskDate!==expected.mskDate||
    !safeId(d.trainingDayId)||d.trainingDayId!==expected.day.id||
    !safeId(d.bundleId)||d.bundleId!==expected.day.id||
    !string(d.title)||!d.title.trim()||!string(d.description)||
    !string(d.type)||!status(d.userStatus)||!Array.isArray(d.steps))
    throw Error("INVALID_DAILY_DETAIL");
  const ids=new Set<string>();
  const steps:TrainingStepPreview[]=d.steps.map((rawStep,index)=>{
    const outer=obj(rawStep),inner=obj(outer?.step);
    if(!outer||!inner||!safeId(outer.stepId)||!safeId(inner.id)||
      outer.stepId!==inner.id||ids.has(outer.stepId)||
      outer.stepIndex!==index||!status(outer.status)||
      !string(inner.title)||!inner.title.trim()||!string(inner.description)||
      !stepType(inner.type)||!count(inner.order)||
      !(inner.durationSec===null||count(inner.durationSec))||
      !Array.isArray(inner.imageUrls)||
      inner.imageUrls.some(x=>typeof x!=="string"))
      throw Error("INVALID_DAILY_STEP");
    ids.add(outer.stepId);
    return {
      id:outer.stepId,title:inner.title,description:inner.description,
      type:inner.type,status:outer.status,order:inner.order,
      durationSec:inner.durationSec??0,locked:false,
      videoUrl:safeStepMediaUrl(inner.videoUrl),
      imageUrls:(inner.imageUrls as string[]).map(safeStepMediaUrl)
        .filter((url):url is string=>url!==null),
    };
  });
  if(steps.length!==expected.day.stepsCount)
    throw Error("DAILY_STEPS_COUNT_MISMATCH");
  return {
    scheduleId:d.scheduleId,mskDate:d.mskDate,
    trainingDayId:d.trainingDayId,bundleId:d.bundleId,
    title:d.title,description:d.description,type:d.type,
    userStatus:d.userStatus,steps,
  };
}
export async function getTodayDailyCourse():Promise<DailyToday>{
  const raw=await apiRequest<unknown>("/api/v1/daily-course/today",
    {method:"GET",browserAuth:true});
  return projectDailyToday(raw);
}
/**
 * Source contract ONLY; AG1 corrected its Core/API false-flag DML branch
 * and published SOURCE/MOCK proof on 2026-10-17. AG1 isolated SQL proof
 * and AG4's separate AG2 Web consumer scope remain PENDING. Never wire
 * this GET as default or claim MIGRATED_VERIFIED until both gates pass.
 * Opt-in UI still requires an explicitly injected synthetic day loader.
 */
export async function sourceOnlyDailyDayGet(today:DailyToday):Promise<DailyDay>{
  if(!today.scheduleId||!safeId(today.scheduleId)||!today.day)
    throw Error("DAILY_NOT_AVAILABLE");
  const query=new URLSearchParams({
    scheduleId:today.scheduleId,createIfMissing:"false",
  });
  const raw=await apiRequest<unknown>(
    "/api/v1/daily-course/day?"+query.toString(),
    {method:"GET",browserAuth:true});
  return projectDailyDay(raw,today);
}
