/**
 * AG4 V90 cancellation RECEIPT CONTRACT ONLY. NOT imported by mobile or browser.
 * Existing route: GET /api/v1/consultations/my[?cursor=<bookingId>].
 * A cancelled booking STATUS is observable; the originating POST is NOT provable.
 * This helper executes NO network, provider, SQL, POST, replay, dequeue or storage.
 * Durable storage and GET wiring in Mobile require separate AG3 evidence/approval.
 */
const idPattern=/^[A-Za-z0-9_-]{1,128}$/;
const statuses=new Set([
 "PENDING_TRAINER_CONFIRMATION","CONFIRMED","CANCELLED_BY_USER",
 "CANCELLED_BY_TRAINER","CANCELLED_BY_SLA","CANCELLED_BY_SYSTEM",
 "COMPLETED","NO_SHOW",
]);
type ReceiptPhase="PREPARED"|"UNKNOWN"|"ACKED";
export type CancellationReceiptV1=Readonly<{
 version:1;kind:"consultation-cancel";ownerId:string;
 authEpochAtIntent:string;bookingId:string;cynologistUserId:string;
 slotId:string;phase:ReceiptPhase;createdAt:number;
}>;
export type VerifiedCancellationReader=Readonly<{
 ownerId:string;authEpoch:string;/** Exact authenticated user object for event-time A→B→A fencing. */
 actorHandle:object;
}>;
export type CancellationReadRequest=Readonly<{
 method:"GET";path:string;skipAuthRefreshReplay:true;
 requestGuard:()=>boolean;
}>;
export type CancellationOutcome={
 status:"CONFIRMED"|"UNKNOWN"|"SERVER_CHANGED"|"UNAVAILABLE";
 evidence:
  |"SERVER_CANCELLED_BY_USER"|"SERVER_ACTIVE"|"SERVER_OTHER_TERMINAL"
  |"GET_INCOMPLETE"|"GET_UNAVAILABLE"|"STALE_SESSION"
  |"UNTRUSTED_RECEIPT"|"INVALID_GET_DTO"|"BOOKING_BINDING_MISMATCH";
 maySendCancelPost:false;
};
const isObj=(x:unknown):x is Record<string,unknown>=>
 !!x&&typeof x==="object"&&!Array.isArray(x);
const result=(status:CancellationOutcome["status"],
 evidence:CancellationOutcome["evidence"]):CancellationOutcome=>({
 status,evidence,maySendCancelPost:false,
});
/** No receipt timestamps/tombstone expiry ever imply safe POST retry. */
export function validateCancellationReceipt(raw:unknown):CancellationReceiptV1|null {
 if(!isObj(raw))return null;
 if(Object.keys(raw).sort().join(",")!==[
  "version","kind","ownerId","authEpochAtIntent","bookingId",
  "cynologistUserId","slotId","phase","createdAt",
 ].sort().join(","))return null;
 if(raw.version!==1||raw.kind!=="consultation-cancel"||
  typeof raw.ownerId!=="string"||!idPattern.test(raw.ownerId)||
  typeof raw.authEpochAtIntent!=="string"||!idPattern.test(raw.authEpochAtIntent)||
  typeof raw.bookingId!=="string"||!idPattern.test(raw.bookingId)||
  typeof raw.cynologistUserId!=="string"||!idPattern.test(raw.cynologistUserId)||
  typeof raw.slotId!=="string"||!idPattern.test(raw.slotId)||
  (raw.phase!=="PREPARED"&&raw.phase!=="UNKNOWN"&&raw.phase!=="ACKED")||
  typeof raw.createdAt!=="number"||!Number.isSafeInteger(raw.createdAt)||
  raw.createdAt<=0)return null;
 return raw as CancellationReceiptV1;
}
/** Source-only acceptance for server ACK: verifies exact POST bookingId, not GET. */
export function ackMatchesCancellationReceipt(
 receipt:CancellationReceiptV1,ack:unknown):boolean {
 if(!isObj(ack)||ack.success!==true||!isObj(ack.data))return false;
 return Object.keys(ack.data).length===1&&ack.data.bookingId===receipt.bookingId;
}
function parsePage(raw:unknown):{
 rows:{id:string;status:string;slotId:string;trainerId:string}[];
 nextCursor:string|null;
}|null {
 if(!isObj(raw)||raw.success!==true||!isObj(raw.data)||
  !Array.isArray(raw.data.items))return null;
 const cursor=raw.data.nextCursor;
 if(cursor!==null&&(typeof cursor!=="string"||!idPattern.test(cursor)))return null;
 const rows: {id:string;status:string;slotId:string;trainerId:string}[]=[];
 for(const source of raw.data.items){
  if(!isObj(source)||typeof source.id!=="string"||!idPattern.test(source.id)||
   typeof source.status!=="string"||!statuses.has(source.status)||
   typeof source.cynologistUserId!=="string"||!idPattern.test(source.cynologistUserId)||
   !isObj(source.slot)||typeof source.slot.id!=="string"||
   !idPattern.test(source.slot.id))return null;
  rows.push({id:source.id,status:source.status,slotId:source.slot.id,
   trainerId:source.cynologistUserId});
 }
 return {rows,nextCursor:cursor};
}
/**
 * READ-ONLY after restart. A persisted PREPARED/UNKNOWN means a POST MAY HAVE
 * committed. The current /my status can confirm state, not POST causality.
 * Full pagination absence/ACTIVE cannot reauthorize POST without a new gate.
 * A verified new epoch of SAME owner may reconcile only by GET; old authEpoch
 * is historical provenance, never a permission or cross-epoch migration key.
 */
export async function reviewCancellationAfterRestart(input:{
 rawReceipt:unknown;
 session:VerifiedCancellationReader|null;
 getSession:()=>VerifiedCancellationReader|null;
 requestPage:(request:CancellationReadRequest)=>Promise<unknown>;
 maxPages?:number;
}):Promise<CancellationOutcome> {
 const receipt=validateCancellationReceipt(input.rawReceipt);
 const session=input.session;
 if(!receipt||!session||session.ownerId!==receipt.ownerId||
  !idPattern.test(session.authEpoch)||!idPattern.test(session.ownerId))
  return result("UNAVAILABLE","UNTRUSTED_RECEIPT");
 const still=()=>{
  const current=input.getSession();
  return !!current&&current.ownerId===session.ownerId&&
   current.authEpoch===session.authEpoch&&
   current.actorHandle===session.actorHandle;
 };
 if(!still())return result("UNAVAILABLE","STALE_SESSION");
 const limit=input.maxPages??5;
 if(!Number.isSafeInteger(limit)||limit<1||limit>20)
  return result("UNAVAILABLE","GET_UNAVAILABLE");
 let cursor:string|null=null;
 const seen=new Set<string>();
 for(let i=0;i<limit;i++){
  if(!still())return result("UNAVAILABLE","STALE_SESSION");
  const path=cursor===null?"/api/v1/consultations/my":
   `/api/v1/consultations/my?cursor=${encodeURIComponent(cursor)}`;
  let raw:unknown;
  try {
   raw=await input.requestPage({method:"GET",path,
    requestGuard:still,skipAuthRefreshReplay:true});
  }catch {
   return still()?result("UNKNOWN","GET_UNAVAILABLE"):
    result("UNAVAILABLE","STALE_SESSION");
  }
  if(!still())return result("UNAVAILABLE","STALE_SESSION");
  const page=parsePage(raw);
  if(!page)return result("UNKNOWN","INVALID_GET_DTO");
  const row=page.rows.find(x=>x.id===receipt.bookingId);
  if(row){
   if(row.slotId!==receipt.slotId||row.trainerId!==receipt.cynologistUserId)
    return result("UNKNOWN","BOOKING_BINDING_MISMATCH");
   if(row.status==="CANCELLED_BY_USER")
    return result("CONFIRMED","SERVER_CANCELLED_BY_USER");
   if(row.status==="PENDING_TRAINER_CONFIRMATION"||row.status==="CONFIRMED")
    return result("UNKNOWN","SERVER_ACTIVE");
   return result("SERVER_CHANGED","SERVER_OTHER_TERMINAL");
  }
  if(page.nextCursor===null)return result("UNKNOWN","GET_INCOMPLETE");
  if(seen.has(page.nextCursor))return result("UNKNOWN","GET_INCOMPLETE");
  seen.add(page.nextCursor);
  cursor=page.nextCursor;
 }
 return result("UNKNOWN","GET_INCOMPLETE");
}
