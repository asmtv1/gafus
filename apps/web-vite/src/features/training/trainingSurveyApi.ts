import { apiRequest } from "../../shared/api/client";
import type { SurveyAnswerValue, SurveyTemplate, SurveyResponseDto,
  SurveyComparisonDto } from "@gafus/types";
import type { TrainingDaySummary } from "./trainingDaysApi";
import type { TrainingStepPreview } from "./trainingDayApi";

export type SurveyAnswers = Record<string, SurveyAnswerValue>;
export type SurveyRead = { template: SurveyTemplate; response: SurveyResponseDto | null };
const object = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === "object" && !Array.isArray(x);
const validId = (x: unknown): x is string =>
  typeof x === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(x);
const cuid = (x: unknown): x is string =>
  typeof x === "string" && /^c[a-z0-9]{24}$/.test(x);
const validSlug = (x: unknown): x is string =>
  typeof x === "string" && /^[a-z0-9][a-z0-9_-]{0,119}$/i.test(x);
const validAnswer = (value:unknown):value is SurveyAnswerValue =>
  value===null||typeof value==="string"||typeof value==="boolean"||
  Array.isArray(value)&&value.every(v=>typeof v==="string");
export function hasSurveyAnswer(value:SurveyAnswerValue | undefined):boolean {
  if(Array.isArray(value))return value.length>0;
  if(typeof value==="string")return value.trim().length>0;
  return typeof value==="boolean";
}
export function validateSurveyAnswers(template:SurveyTemplate,
  answers:SurveyAnswers):boolean {
  const questions=new Map(template.questions.map(q=>[q.id,q]));
  if(Object.entries(answers).some(([key,value])=>{
    const q=questions.get(key);
    if(!q||!validAnswer(value))return true;
    if(q.type==="singleChoice" && value!==null &&
      (typeof value!=="string" || !q.options?.some(o=>o.value===value)))return true;
    if(q.type==="multiChoice" && value!==null &&
      (!Array.isArray(value)||value.some(item=>!q.options?.some(o=>o.value===item))))
      return true;
    if(q.type==="boolean" && value!==null && typeof value!=="boolean")return true;
    if(q.type!=="multiChoice"&&q.type!=="singleChoice"&&q.type!=="boolean"&&
      value!==null&&typeof value!=="string")return true;
    return false;
  }))return false;
  return template.questions.every(q=>!q.required||hasSurveyAnswer(answers[q.id]));
}
export async function readSurveyTemplate(slug:string,stepId:string,
  courseId:string):Promise<SurveyRead>{
  if(!validSlug(slug)||!validId(stepId)||!validId(courseId))
    throw Error("INVALID_SURVEY_READ");
  const body=await apiRequest<unknown>(
    "/api/v1/surveys/"+encodeURIComponent(slug)+"?stepId="+encodeURIComponent(stepId),
    {method:"GET",browserAuth:true});
  if(!object(body)||!object(body.template)||!Array.isArray(body.template.questions)||
      !Array.isArray(body.template.sections)||body.template.slug!==slug||
      !["INITIAL","FINAL"].includes(String(body.template.phase))||
      !validId(body.template.familySlug)||typeof body.template.title!=="string"||
      typeof body.template.description!=="string")throw Error("INVALID_SURVEY_TEMPLATE");
  const seen=new Set<string>();
  for(const q of body.template.questions){
    if(!object(q)||!validId(q.id)||seen.has(q.id)||!validId(q.sectionId)||
        typeof q.title!=="string"||!q.title||
        !["text","textarea","singleChoice","multiChoice","boolean","petSelect"]
          .includes(String(q.type))||
        (q.options!==undefined && (!Array.isArray(q.options)||
          q.options.some(o=>!object(o)||!validId(o.value)||
            typeof o.label!=="string"))))
      throw Error("INVALID_SURVEY_QUESTION");
    seen.add(q.id);
  }
  if(body.response!==null && (!object(body.response)||
      body.response.courseId!==courseId||body.response.stepId!==stepId||
      body.response.surveySlug!==slug||!object(body.response.answers)||
      Object.values(body.response.answers).some(v=>!validAnswer(v))||
      typeof body.response.canEdit!=="boolean"))
    throw Error("INVALID_SURVEY_RESPONSE");
  return body as unknown as SurveyRead;
}
export async function readSurveyComparison(courseId:string,familySlug:string):
  Promise<SurveyComparisonDto|null>{
  if(!validId(courseId)||!validId(familySlug))throw Error("INVALID_SURVEY_COMPARISON");
  const body=await apiRequest<unknown>("/api/v1/surveys/comparison?courseId="+
    encodeURIComponent(courseId)+"&familySlug="+encodeURIComponent(familySlug),
  {method:"GET",browserAuth:true});
  if(body!==null && (!object(body)||body.familySlug!==familySlug||
      !Array.isArray(body.items)))throw Error("INVALID_SURVEY_COMPARISON_ACK");
  return body as SurveyComparisonDto|null;
}
/** User explicitly clicks submit, which allows the original Core
 * createIfMissing path. Never create progress on mere panel expansion.
 * Revalidate actor and exact physical occurrence before this side-effectful GET.
 */
export async function initializeSurveyOccurrence(
  courseType:string,day:TrainingDaySummary,step:TrainingStepPreview,
  stillOwner:()=>boolean):Promise<string>{
  if(!validId(courseType)||!validId(day.courseId)||!validId(day.dayOnCourseId)||
      step.type!=="SURVEY"||step.locked||day.isLocked||!step.surveySlug||
      !validSlug(step.surveySlug)||!validId(step.id)||
      !Number.isSafeInteger(step.order)||step.order<0||!stillOwner())
    throw Error("INVALID_SURVEY_OCCURRENCE");
  const qs=new URLSearchParams({courseType,dayOnCourseId:day.dayOnCourseId,
    createIfMissing:"true"});
  const raw=await apiRequest<unknown>("/api/v1/training/day?"+qs,
    {method:"GET",browserAuth:true});
  if(!stillOwner())throw Error("SURVEY_ACTOR_CHANGED");
  if(!object(raw)||raw.courseId!==day.courseId||
      raw.dayOnCourseId!==day.dayOnCourseId||!Array.isArray(raw.steps))
    throw Error("SURVEY_DAY_CHANGED");
  const matches=raw.steps.filter(row=>object(row)&&row.id===step.id&&
    row.order===step.order&&row.type==="SURVEY"&&row.locked===false&&
    row.surveySlug===step.surveySlug);
  const bound=matches[0];
  if(matches.length!==1||!object(bound)||!cuid(bound.userStepId))
    throw Error("SURVEY_STEP_CHANGED");
  return bound.userStepId;
}
export async function submitSurveyVerified(
  slug:string,courseId:string,stepId:string,userStepId:string,
  answers:SurveyAnswers):Promise<void>{
  if(!validSlug(slug)||!validId(courseId)||!validId(stepId)||!cuid(userStepId)||
      Object.values(answers).some(v=>!validAnswer(v)))
    throw Error("INVALID_SURVEY_SUBMISSION");
  // The Hono POST performs course/step/userStep entitlement and window checks.
  await apiRequest<unknown>("/api/v1/surveys/"+encodeURIComponent(slug)+"/response",
  {method:"POST",browserAuth:true,
    json:{courseId,stepId,userStepId,answers}});
}
