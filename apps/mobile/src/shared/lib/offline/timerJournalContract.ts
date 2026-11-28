import type { V2PendingEvent, V2SessionBinding } from "./newOnlyV2Queues";
import { readJournalVersionFields, validProgressVersion, type JournalVersionFields } from "./journalVersionFields";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CUID = /^c[a-z0-9]{8,}$/;
type Action = "start" | "pause" | "resume" | "reset";
const kinds: Record<string, Action> = {
  startStep:"start",pauseStep:"pause",resumeStep:"resume",resetStep:"reset",
  dailyCourseStartStep:"start",dailyCoursePauseStep:"pause",dailyCourseResumeStep:"resume",dailyCourseResetStep:"reset",
};
export type TimerBody = Readonly<JournalVersionFields & {
  eventId:string; stepIndex:number; expectedStepId:string; action:Action;
  remainingSec?:number; recordedAt:number;
} & (
  {operation:"training.timer"; courseId:string; dayOnCourseId:string; expectedStepOnDayId:string} |
  {operation:"daily.timer"; scheduleId:string; expectedBundleStepId:string}
)>;
export type TimerJournalPreview = Readonly<{ post: Readonly<{
  path:"/api/v1/offline/mutations"; method:"POST";
  headers:Readonly<{"X-Gafus-Sync-Protocol":"2";"Idempotency-Key":string}>;
  body:TimerBody;
}> }>;
const captured=new WeakMap<TimerJournalPreview,{ binding:V2SessionBinding; body:string }>();
const isId=(v:unknown):v is string=>typeof v==="string"&&CUID.test(v);
function bodyFor(event:V2PendingEvent):TimerBody {
  const p=event.payload, action=kinds[event.kind], daily=event.kind.startsWith("dailyCourse");
  const base=readJournalVersionFields(p);
  const remaining=action==="start"?p.durationSec:action==="pause"?p.timeLeftSec:undefined;
  if (!action||!UUID.test(event.eventId)||!isId(p.expectedStepId)||!Number.isSafeInteger(p.stepIndex)||
      Number(p.stepIndex)<0||!Number.isSafeInteger(event.createdAt)||event.createdAt<=0||
      Boolean(base.expectedVersion)===Boolean(base.previousEventId)||
      ((action==="start"||action==="pause")&&(!Number.isSafeInteger(remaining)||Number(remaining)<0||Number(remaining)>86400))||
      (action==="start"&&p.status!=="IN_PROGRESS"))
    throw new Error("V2_TIMER_CONTRACT_INVALID");
  const common={...base,eventId:event.eventId,stepIndex:Number(p.stepIndex),expectedStepId:p.expectedStepId,
    action,recordedAt:event.createdAt,...(remaining===undefined?{}:{remainingSec:Number(remaining)})};
  if(daily){
    if(!isId(p.scheduleId)||!isId(p.expectedBundleStepId))throw new Error("V2_TIMER_CONTRACT_INVALID");
    return Object.freeze({...common,operation:"daily.timer",scheduleId:p.scheduleId,expectedBundleStepId:p.expectedBundleStepId});
  }
  if(!isId(p.courseId)||!isId(p.dayOnCourseId)||!isId(p.expectedStepOnDayId))throw new Error("V2_TIMER_CONTRACT_INVALID");
  return Object.freeze({...common,operation:"training.timer",courseId:p.courseId,dayOnCourseId:p.dayOnCourseId,expectedStepOnDayId:p.expectedStepOnDayId});
}
export function prepareTimerJournal(binding:V2SessionBinding,event:V2PendingEvent):TimerJournalPreview|null {
  if(!Object.hasOwn(kinds,event.kind)||!binding.principalId||!UUID.test(binding.authEpoch))return null;
  // Unsupported historical entries remain visible and block the FIFO, never guessed.
  let body:TimerBody;
  try{body=bodyFor(event)}catch{ /* diagnostic: expected Invalid timer journal cannot be prepared for replay. */ return null}
  const preview:TimerJournalPreview=Object.freeze({post:Object.freeze({
    path:"/api/v1/offline/mutations",method:"POST",
    headers:Object.freeze({"X-Gafus-Sync-Protocol":"2","Idempotency-Key":body.eventId}),body,
  })});
  captured.set(preview,{binding:{...binding},body:JSON.stringify(body)});
  return preview;
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
export function verifyTimerAck(preview:TimerJournalPreview,binding:V2SessionBinding,event:V2PendingEvent,response:unknown):boolean{
  const snapshot=captured.get(preview);
  if(!snapshot||snapshot.binding.principalId!==binding.principalId||snapshot.binding.authEpoch!==binding.authEpoch||
      !record(response)||response.success!==true||!record(response.ack))return false;
  let body:TimerBody;
  try{body=bodyFor(event)}catch{ /* diagnostic: expected Unverified timer acknowledgement cannot clear pending data. */ return false}
  const ack=response.ack;
  return JSON.stringify(body)===snapshot.body&&ack.protocol===2&&ack.eventId===body.eventId&&
    ack.operation===body.operation&&ack.state==="COMMITTED"&&typeof ack.replayed==="boolean"&&
    typeof ack.serverRevision==="string"&&/^[1-9][0-9]*$/.test(ack.serverRevision)&&record(ack.result)&&
    validProgressVersion(ack.result.progressVersion)&&typeof ack.result.allCompleted==="boolean"&&
    typeof ack.result.stepJustCompleted==="boolean"&&
    (body.operation==="training.timer"?ack.result.courseId===body.courseId:ack.result.scheduleId===body.scheduleId);
}
