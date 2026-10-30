/** TR012 OPTION A SOURCE/MOCK ONLY. Companion header design, NOT mounted by GET.
 * Existing strict CourseDraftDto stays unchanged. No HTTP writes or CAS claims.
 */
import type {PanelActor} from "./consultationContract";
import {readTrainerCourseDraft,type TrainerCourseDraft} from "./trainerCourseDraftReadContract";
import {parseNameOnlyWriteProposal,type NameOnlyWriteProposal} from "./AG4TR012MetadataWriteContract20261022";
export const REVISION_HEADER="x-gafus-course-updated-at";
const iso=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export type Session=Readonly<{actor:PanelActor;authEpoch:string;token:string;actorHandle:object}>;
export type Observation=Readonly<{
 draft:TrainerCourseDraft;updatedAt:string;actorId:string;
 role:"ADMIN"|"TRAINER";authEpoch:string;
 readyForWrite:false;collisionSafe:false;
}>;
export function parseRevision(value:string|null):string {
 if(!value||!iso.test(value))throw Error("REVISION_UNAVAILABLE");
 const d=new Date(value);
 if(!Number.isFinite(d.getTime())||d.toISOString()!==value)
  throw Error("REVISION_UNAVAILABLE");
 return value;
}
export function stillSame(expected:Session,now:Session|null){
 return !!now&&expected.actor.id===now.actor.id&&expected.actor.role===now.actor.role&&
  expected.authEpoch===now.authEpoch&&expected.token===now.token&&
  expected.actorHandle===now.actorHandle;
}
/** Provisional header captured from SAME validated GET, fail-closed if absent. */
export async function observeNameRevision(input:{
 courseId:string;session:Session;getCurrentSession:()=>Session|null;
 signal:AbortSignal;fetchImpl:typeof fetch;
}):Promise<Observation>{
 const {session,signal}=input;
 if((session.actor.role!=="TRAINER"&&session.actor.role!=="ADMIN")||
  !session.authEpoch||!session.token||signal.aborted||
  !stillSame(session,input.getCurrentSession()))throw Error("SESSION_RETIRED");
 const current=()=>!signal.aborted&&stillSame(session,input.getCurrentSession());
 const captured:{response:Response|null}={response:null};
 const fetchWithHeader:typeof fetch=async(url,options)=>{
  if(!current()||options?.method!=="GET"||options.cache!=="no-store"||
   options.referrerPolicy!=="no-referrer")throw Error("UNSAFE_GET");
  const response=await input.fetchImpl(url,options);
  if(!current())throw Error("SESSION_RETIRED");
  captured.response=response;
  return response;
 };
 const draft=await readTrainerCourseDraft({
  actor:session.actor,courseId:input.courseId,token:session.token,signal,
  fetchImpl:fetchWithHeader,isCurrent:current,
 });
 if(!current()||!captured.response)throw Error("SESSION_RETIRED");
 const updatedAt=parseRevision(captured.response.headers.get(REVISION_HEADER));
 if(!current())throw Error("SESSION_RETIRED");
 return {draft,updatedAt,actorId:session.actor.id,role:session.actor.role,
  authEpoch:session.authEpoch,readyForWrite:false,collisionSafe:false};
}
/** Preview does not send requests, enable writes, or grant 409 guarantee. */
export function previewNameChange(observed:Observation,name:string,session:Session,
 getCurrentSession:()=>Session|null):Readonly<{payload:NameOnlyWriteProposal;readyForWrite:false}>{
 if(!stillSame(session,getCurrentSession())||session.actor.id!==observed.actorId||
  session.actor.role!==observed.role||session.authEpoch!==observed.authEpoch)
  throw Error("SESSION_RETIRED");
 return {payload:parseNameOnlyWriteProposal({courseId:observed.draft.id,name,
  observedUpdatedAt:observed.updatedAt}),readyForWrite:false};
}
/** Two writes can share one updatedAt tick; source/SQL uniqueness not proven. */
export function timestampCollision(firstRead:string,afterFirstWrite:string){
 parseRevision(firstRead);parseRevision(afterFirstWrite);
 return {staleSecondCasMayMatch:firstRead===afterFirstWrite,
  safeForConcurrency:false,readyFor409:false} as const;
}
