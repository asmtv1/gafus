import {apiRequest} from "../../shared/api/client";
import type {UserCoursePersonalization} from "@gafus/types";
import type {TrainingDaysRead,TrainingDaysWireItem} from "@gafus/types";

/**
 * Existing protected Hono GET /api/v1/training/days?type=...
 * Private server-owned progress/locks; never fetch on a guest session.
 * Whitelist fields before placing a projection in a Web Query cache:
 * personalization names, media URLs and other Core fields stay out.
 */
// Only the ten originally approved public-safe Web fields; never cache the full wire.
export type TrainingDaySummary=Pick<TrainingDaysWireItem,
  "trainingDayId"|"dayOnCourseId"|"title"|"type"|"courseId"|
  "estimatedDuration"|"theoryMinutes"|"equipment"|"isLocked"
> & {
  // Retain the existing literal status set and check it against the shared enum.
  userStatus:Extract<`${TrainingDaysWireItem["userStatus"]}`,
    "NOT_STARTED"|"IN_PROGRESS"|"COMPLETED"|"PAUSED"|"RESET">;
};
export type TrainingDaysOverview=Pick<TrainingDaysRead["data"],
  "courseId"|"courseDescription"|"courseEquipment"|"courseTrainingLevel"
> & {
  requiresPersonalization:boolean;
  isPersonalizedCourse?:boolean;
  days:TrainingDaySummary[];
};
const safeId=(value:unknown):value is string=>
  typeof value==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const trainingStatus=(v:unknown):v is TrainingDaySummary["userStatus"]=>
  ["NOT_STARTED","IN_PROGRESS","COMPLETED","PAUSED","RESET"].includes(String(v));
function isDay(v:unknown):v is TrainingDaySummary{
  if(!v||typeof v!=="object"||Array.isArray(v))return false;
  const d=v as Record<string,unknown>;
  return safeId(d.trainingDayId)&&safeId(d.dayOnCourseId)&&safeId(d.courseId)&&
    typeof d.title==="string"&&d.title.trim().length>0&&
    typeof d.type==="string"&&trainingStatus(d.userStatus)&&
    Number.isSafeInteger(d.estimatedDuration)&&
    Number(d.estimatedDuration)>=0&&Number(d.estimatedDuration)<=1440&&
    Number.isSafeInteger(d.theoryMinutes)&&
    Number(d.theoryMinutes)>=0&&Number(d.theoryMinutes)<=1440&&
    typeof d.equipment==="string"&&typeof d.isLocked==="boolean";
}
const optionalText=(v:unknown):v is string|null=>v===null||typeof v==="string";
export function projectTrainingDays(raw:unknown):TrainingDaysOverview{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("INVALID_TRAINING_DAYS");
  const d=raw as Record<string,unknown>;
  if(!Array.isArray(d.trainingDays)||!d.trainingDays.every(isDay)||
    !(d.courseId===null||safeId(d.courseId))||
    !optionalText(d.courseDescription)||!optionalText(d.courseEquipment)||
    !optionalText(d.courseTrainingLevel)||
    typeof d.courseIsPersonalized!=="boolean"||
    !(d.userCoursePersonalization===null||
      (typeof d.userCoursePersonalization==="object"&&
        d.userCoursePersonalization!==null&&!Array.isArray(d.userCoursePersonalization))))
    throw Error("INVALID_TRAINING_DAYS");
  if(d.trainingDays.some((day:TrainingDaySummary)=>day.courseId!==d.courseId))
    throw Error("MISMATCHED_TRAINING_COURSE");
  const ids=new Set<string>();
  for(const day of d.trainingDays as TrainingDaySummary[]){
    if(ids.has(day.dayOnCourseId))throw Error("DUPLICATE_TRAINING_DAY");
    ids.add(day.dayOnCourseId);
  }
  return {
    courseId:d.courseId as string|null,
    courseDescription:d.courseDescription as string|null,
    courseEquipment:d.courseEquipment as string|null,
    courseTrainingLevel:d.courseTrainingLevel as string|null,
    requiresPersonalization:d.courseIsPersonalized===true&&
      d.userCoursePersonalization===null,
    isPersonalizedCourse:d.courseIsPersonalized===true,
    days:(d.trainingDays as TrainingDaySummary[]).map(day=>({
      trainingDayId:day.trainingDayId,
      dayOnCourseId:day.dayOnCourseId,
      title:day.title,
      type:day.type,
      courseId:day.courseId,
      userStatus:day.userStatus,
      estimatedDuration:day.estimatedDuration,
      theoryMinutes:day.theoryMinutes,
      equipment:day.equipment,
      isLocked:day.isLocked,
    })),
  };
}
export async function listTrainingDays(courseType:string):Promise<TrainingDaysOverview>{
  if(!safeId(courseType))throw Error("Некорректный тип курса");
  const body=await apiRequest<unknown>("/api/v1/training/days?type="+
    encodeURIComponent(courseType),{method:"GET",browserAuth:true});
  return projectTrainingDays(body);
}

/** Next-compatible original Hono POST: server returns {success:true} with no data.
 * Never auto-repeat a submitted POST after an unknown acknowledgment. */
export type PersonalizationDraft=UserCoursePersonalization;
export async function submitTrainingPersonalization(courseId:string,
  draft:PersonalizationDraft):Promise<void>{
  if(!safeId(courseId))throw Error("INVALID_PERSONALIZATION_COURSE");
  const userDisplayName=draft.userDisplayName.trim();
  const petName=draft.petName.trim();
  if(!userDisplayName||!petName||userDisplayName.length>100||petName.length>100||
    !["male","female"].includes(draft.userGender)||
    !(draft.petGender===null||draft.petGender===undefined||
      ["male","female"].includes(draft.petGender)))
    throw Error("INVALID_PERSONALIZATION_FORM");
  const optionalName=(value:unknown)=>
    typeof value==="string"&&value.trim()?value.trim():null;
  const payload:PersonalizationDraft={userDisplayName,userGender:draft.userGender,
    petName,petGender:draft.petGender??null,
    petNameGen:optionalName(draft.petNameGen),petNameDat:optionalName(draft.petNameDat),
    petNameAcc:optionalName(draft.petNameAcc),petNameIns:optionalName(draft.petNameIns),
    petNamePre:optionalName(draft.petNamePre)};
  await apiRequest<void>("/api/v1/courses/personalization",{
    method:"POST",browserAuth:true,json:{courseId,...payload},expectedStatus:200,
  });
}
/** Fresh, deliberately UN-CACHED owner GET with exact persisted-field proof.
 * Full personal data remains only inside this short-lived call, not in the
 * shared/public TrainingDaysOverview projection or React Query cache. */
export async function verifyTrainingPersonalization(courseType:string,
  courseId:string,draft:PersonalizationDraft):Promise<boolean>{
  if(!safeId(courseType)||!safeId(courseId))
    throw Error("INVALID_PERSONALIZATION_COURSE");
  const raw=await apiRequest<unknown>("/api/v1/training/days?type="+
    encodeURIComponent(courseType),{method:"GET",browserAuth:true,expectedStatus:200});
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return false;
  const values=raw as Record<string,unknown>;
  if(values.courseId!==courseId||values.courseIsPersonalized!==true)return false;
  const saved=values.userCoursePersonalization;
  if(!saved||typeof saved!=="object"||Array.isArray(saved))return false;
  const fields=saved as Record<string,unknown>;
  const normalized=(value:unknown)=>typeof value==="string"?value.trim():"";
  if(normalized(fields.userDisplayName)!==draft.userDisplayName.trim()||
    fields.userGender!==draft.userGender||
    normalized(fields.petName)!==draft.petName.trim()||
    (fields.petGender??null)!==(draft.petGender??null))return false;
  for(const field of ["petNameGen","petNameDat","petNameAcc","petNameIns","petNamePre"] as const){
    if(normalized(fields[field])!==normalized(draft[field]))return false;
  }
  return true;
}

/** Next's "Изменить персонализацию" prefills from an owner-private GET.
 * Return minimal validated strings, never put them in a shared query cache. */
export async function getSavedTrainingPersonalization(courseType:string,
  courseId:string):Promise<PersonalizationDraft>{
  if(!safeId(courseType)||!safeId(courseId))
    throw Error("INVALID_PERSONALIZATION_COURSE");
  const raw=await apiRequest<unknown>("/api/v1/training/days?type="+
    encodeURIComponent(courseType),{method:"GET",browserAuth:true,expectedStatus:200});
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("INVALID_PRIVATE_PERSONALIZATION");
  const row=raw as Record<string,unknown>;
  if(row.courseId!==courseId||row.courseIsPersonalized!==true||
    !row.userCoursePersonalization||typeof row.userCoursePersonalization!=="object"||
    Array.isArray(row.userCoursePersonalization))throw Error("INVALID_PRIVATE_PERSONALIZATION");
  const fields=row.userCoursePersonalization as Record<string,unknown>;
  const name=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0;
  const option=(v:unknown)=>v===null||v===undefined||
    (typeof v==="string"&&v.length<=100);
  if(!name(fields.userDisplayName)||!name(fields.petName)||
    fields.userDisplayName.length>100||fields.petName.length>100||
    !["male","female"].includes(String(fields.userGender))||
    !(fields.petGender===null||fields.petGender===undefined||
      ["male","female"].includes(String(fields.petGender)))||
    !["petNameGen","petNameDat","petNameAcc","petNameIns","petNamePre"]
      .every(key=>option(fields[key])))throw Error("INVALID_PRIVATE_PERSONALIZATION");
  const limited=(v:unknown)=>typeof v==="string"?v:null;
  return {userDisplayName:fields.userDisplayName,userGender:fields.userGender as "male"|"female",
    petName:fields.petName,petGender:fields.petGender as "male"|"female"|null|undefined,
    petNameGen:limited(fields.petNameGen),petNameDat:limited(fields.petNameDat),
    petNameAcc:limited(fields.petNameAcc),petNameIns:limited(fields.petNameIns),
    petNamePre:limited(fields.petNamePre)};
}
