import {apiRequest} from "../../shared/api/client";
import type {TrainingDaySummary} from "./trainingDaysApi";
import type {TrainingDayWire,TrainingDayStepWire} from "@gafus/types";

/** Minimal verified read-only projection of Hono GET /training/day.
 * This GET must not initialize UserTraining: createIfMissing=false always.
 * Never cache Core userStepId, monetization targets or raw signed URLs.
 */
export type TrainingStepPreview=Pick<TrainingDayStepWire,
  "id"|"title"|"description"|"order"|"durationSec"|"estimatedDurationSec"|"videoUrl"
> & {
  // The producer marks these optional; this verified Web projection requires
  // them and never exposes the original optional/locked raw payload.
  type:NonNullable<TrainingDayStepWire["type"]>;
  status:`${TrainingDayStepWire["status"]}`;
  locked:NonNullable<TrainingDayStepWire["locked"]>;
  imageUrls:NonNullable<TrainingDayStepWire["imageUrls"]>;
  /** Only the server-issued physical StepOnDay target for a locked step. */
  unlockTargetId?:string;
  /** Only visible owner-authorized SURVEY steps expose their template slug. */
  surveySlug?:string;
  pdfUrls?:string[];
};
export type TrainingDayDetail=Pick<TrainingDayWire,
  "trainingDayId"|"dayOnCourseId"|"courseId"|"title"|"type"|"description"
> & {
  userStatus:`${TrainingDayWire["userStatus"]}`;
  steps:TrainingStepPreview[];
};
const idOk=(v:unknown):v is string=>typeof v==="string"&&
  /^[A-Za-z0-9_-]{1,128}$/.test(v);
const isStatus=(v:unknown):v is TrainingStepPreview["status"]=>
  ["NOT_STARTED","IN_PROGRESS","COMPLETED","PAUSED","RESET"].includes(String(v));
const isStepType=(v:unknown):v is TrainingStepPreview["type"]=>
  ["TRAINING","PRACTICE","THEORY","BREAK","EXAMINATION","DIARY","SURVEY"].includes(String(v));
const rec=(v:unknown):Record<string,unknown>|null=>
  v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;
/** Explicit scheme safety: no javascript, blob, data, credentials or // hosts. */
export function safeStepMediaUrl(value:unknown):string|null{
  if(typeof value!=="string"||!value||value.length>4096)return null;
  if(value.startsWith("/")&&!value.startsWith("//")&&
    !value.includes("\\")&&!value.includes("\n")&&!value.includes("\r"))return value;
  try{
    const url=new URL(value);
    if(url.protocol==="https:"&&!url.username&&!url.password)return url.href;
  }catch{/* invalid URL */}
  return null;
}
export function projectTrainingDay(raw:unknown,expected:Pick<
  TrainingDaySummary,"trainingDayId"|"dayOnCourseId"|"courseId"
>):TrainingDayDetail{
  const d=rec(raw);
  if(!d||!idOk(d.trainingDayId)||!idOk(d.dayOnCourseId)||!idOk(d.courseId)||
    // Original Core GET /days projects trainingDayId=DayOnCourse.id,
    // while GET /day projects trainingDayId=Day.id. Their secure common
    // locator is the exact dayOnCourseId plus courseId; both must match.
    d.dayOnCourseId!==expected.dayOnCourseId||d.courseId!==expected.courseId||
    typeof d.title!=="string"||!d.title.trim()||
    typeof d.type!=="string"||typeof d.description!=="string"||
    !isStatus(d.userStatus)||!Array.isArray(d.steps))
    throw Error("INVALID_TRAINING_DAY");
  // A Step template is reusable many times in a single day. The original
  // producer's StepOnDay occurrence order, not Step.id, distinguishes rows.
  const seenOrders=new Set<number>();
  const steps:TrainingStepPreview[]=d.steps.map(value=>{
    const s=rec(value);
    if(!s||!idOk(s.id)||typeof s.title!=="string"||
      typeof s.description!=="string"||
      !isStepType(s.type)||!isStatus(s.status)||typeof s.locked!=="boolean"||
      !Number.isSafeInteger(s.order)||Number(s.order)<0||
      !Number.isSafeInteger(s.durationSec)||Number(s.durationSec)<0||
      seenOrders.has(s.order as number) ||
      (s.estimatedDurationSec != null &&
        (!Number.isSafeInteger(s.estimatedDurationSec) ||
          Number(s.estimatedDurationSec) < 0)))throw Error("INVALID_TRAINING_STEP");
    seenOrders.add(s.order as number);
    if(s.locked===true){
      const target=rec(s.monetizationTarget);
      const physicalTarget=target?.targetType==="COURSE_STEP"&&
        typeof target.targetId==="string"&&/^c[a-z0-9]{24}$/.test(target.targetId)
        ? target.targetId:null;
      return {
      id:s.id as string,title:s.title as string,description:"",
      type:s.type as TrainingStepPreview["type"],
      status:s.status as TrainingStepPreview["status"],
      order:s.order as number,durationSec:s.durationSec as number,
      locked:true,videoUrl:null,imageUrls:[],
      ...(physicalTarget?{unlockTargetId:physicalTarget}:{}),
    };
    }
    if(s.surveySlug!==undefined&&s.surveySlug!==null&&
      (typeof s.surveySlug!=="string"||
        !/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(s.surveySlug)||
        s.type!=="SURVEY"))
      throw Error("INVALID_TRAINING_SURVEY_SLUG");
    const rawImages=s.imageUrls;
    if(rawImages!==undefined&&
      (!Array.isArray(rawImages)||rawImages.some(x=>typeof x!=="string")))
      throw Error("INVALID_TRAINING_MEDIA");
    const images=(rawImages??[]) as string[];
    const rawPdf=s.pdfUrls;
    if(rawPdf!==undefined&&
      (!Array.isArray(rawPdf)||rawPdf.some(x=>typeof x!=="string")))
      throw Error("INVALID_TRAINING_MEDIA");
    const pdfUrls=(rawPdf??[]) as string[];
    return {
      id:s.id as string,title:s.title as string,description:s.description as string,
      type:s.type as TrainingStepPreview["type"],
      status:s.status as TrainingStepPreview["status"],
      order:s.order as number,durationSec:s.durationSec as number,
      locked:false,
      ...(s.type==="SURVEY"&&typeof s.surveySlug==="string"?
        {surveySlug:s.surveySlug}:{}),
      estimatedDurationSec:s.estimatedDurationSec == null
        ? null : s.estimatedDurationSec as number,
      videoUrl:safeStepMediaUrl(s.videoUrl),
      imageUrls:images.map(safeStepMediaUrl).filter((x):x is string=>!!x),
      pdfUrls:pdfUrls.map(safeStepMediaUrl).filter((x):x is string=>!!x),
    };
  });
  return {
    trainingDayId:d.trainingDayId as string,dayOnCourseId:d.dayOnCourseId as string,
    courseId:d.courseId as string,title:d.title as string,type:d.type as string,
    description:d.description as string,
    userStatus:d.userStatus as TrainingStepPreview["status"],steps,
  };
}
/** Only existing Hono GET, never platform purchase/unlock, diary or step POST. */
export async function getTrainingDay(
  courseType:string,day:TrainingDaySummary,
):Promise<TrainingDayDetail>{
  if(!idOk(courseType)||!idOk(day.dayOnCourseId)||!idOk(day.courseId)||
    !idOk(day.trainingDayId)||day.isLocked)
    throw Error("INVALID_OR_LOCKED_TRAINING_DAY");
  const query=new URLSearchParams({
    courseType,dayOnCourseId:day.dayOnCourseId,createIfMissing:"false",
  });
  const body=await apiRequest<unknown>(
    "/api/v1/training/day?"+query.toString(),{
      method:"GET",browserAuth:true,
    });
  return projectTrainingDay(body,day);
}

/** LEARN032 source-only Web wire adapter. NOT connected to a live control:
 * the GET day step-array <-> Core mutation stepIndex identity has no AG1
 * positive verdict. No inferred order/stepId mapping or new idempotency key.
 * Old Native clients keep their existing routes and optional body fields.
 */
export type TrainingOnlineAction="start"|"pause"|"resume"|
  "complete/practice"|"complete/theory";
export type TrainingOnlineStepWire={
  courseId:string;
  dayOnCourseId:string;
  stepIndex:number;
};
export type TrainingOnlineStepCommand=
  |{action:"start";ids:TrainingOnlineStepWire;durationSec:number}
  |{action:"pause";ids:TrainingOnlineStepWire;timeLeftSec:number}
  |{action:"resume"|"complete/practice"|"complete/theory";
    ids:TrainingOnlineStepWire};
const wireInt=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
const wireId=(v:unknown)=>typeof v==="string"&&
  /^[A-Za-z0-9_-]{1,128}$/.test(v);
/** Caller MUST have independently proven producer positional binding first.
 * This adapter performs no position inference, auto-retry or reconciliation.
 */
export async function postTrainingOnlineStep(command:TrainingOnlineStepCommand):Promise<void>{
  const {courseId,dayOnCourseId,stepIndex}=command.ids;
  if(!wireId(courseId)||!wireId(dayOnCourseId)||!wireInt(stepIndex)||
    (command.action==="start"&&!wireInt(command.durationSec))||
    (command.action==="pause"&&!wireInt(command.timeLeftSec)))
    throw Error("INVALID_ONLINE_PROGRESS_WIRE");
  const timer=command.action==="start"?
    {status:"IN_PROGRESS" as const,durationSec:command.durationSec}:
    command.action==="pause"?{timeLeftSec:command.timeLeftSec}:{};
  await apiRequest<void>("/api/v1/training/step/"+command.action,{
    method:"POST",browserAuth:true,expectedStatus:200,
    json:{courseId,dayOnCourseId,stepIndex,...timer},
  });
}
