/** AG4 read-only cancellation receipt gate, no native/device/network/DB/provider. */
import {expect,it,vi} from "vitest";
import {
 ackMatchesCancellationReceipt,reviewCancellationAfterRestart,
 validateCancellationReceipt,
 type CancellationReadRequest,type CancellationReceiptV1,
 type VerifiedCancellationReader,
} from "./AG4CancellationReceiptReview20261021.scoped";
const owner="user_A",booking="booking_1",trainer="trainer_A",slot="slot_A";
const epoch="epoch_PRE_CRASH",laterEpoch="epoch_FRESH_LOGIN";
const receipt=(phase:CancellationReceiptV1["phase"]="PREPARED")=>({
 version:1 as const,kind:"consultation-cancel" as const,
 ownerId:owner,authEpochAtIntent:epoch,
 bookingId:booking,cynologistUserId:trainer,slotId:slot,
 phase,createdAt:1,
});
const userObj={id:owner};
const context=(id=owner,e=laterEpoch,handle:object=userObj):
 VerifiedCancellationReader=>({ownerId:id,authEpoch:e,actorHandle:handle});
const page=(status:string,id=booking,options:{
 nextCursor?:string|null;trainerId?:string;slotId?:string;
}={})=>({
 success:true,data:{items:[{id,status,
  cynologistUserId:options.trainerId??trainer,
  slot:{id:options.slotId??slot},
  clientPhone:"PRIVATE_PHONE_NOT_FOR_TELEMETRY",
  clientProblem:"PRIVATE_REASON_NOT_FOR_TELEMETRY",
 }],nextCursor:options.nextCursor??null},
});
const empty=(nextCursor:string|null=null)=>({
 success:true,data:{items:[],nextCursor},
});
const cancelled=page("CANCELLED_BY_USER");
function simulate(initial:unknown=receipt(),responses:unknown[]=[cancelled],s=context()){
 const pending=[...responses];
 const requests:CancellationReadRequest[]=[];
 let live:VerifiedCancellationReader|null=s;
 const requestPage=vi.fn(async(r:CancellationReadRequest)=>{
  requests.push(r);
  if(!r.requestGuard())throw Error("GUARD_CLOSED");
  return pending.shift();
 });
 return {
  run:()=>reviewCancellationAfterRestart({rawReceipt:initial,session:s,
   getSession:()=>live,requestPage}),
  setSession:(next:VerifiedCancellationReader|null)=>{live=next;},
  requestPage,requests,
 };
}
const forbidPost=(requests:CancellationReadRequest[])=>{
 expect(requests.every(r=>r.method==="GET"&&
  r.path.startsWith("/api/v1/consultations/my")&&
  r.skipAuthRefreshReplay===true)).toBe(true);
};

it("crash AFTER provider/server cancel but BEFORE local ACK write: PREPARED + fresh GET CANCELLED_BY_USER confirms STATE",async()=>{
 // Disk still holds the write-ahead PREPARED record; local ACK write never happened.
 const disk=JSON.stringify(receipt("PREPARED"));
 const afterRestart=simulate(JSON.parse(disk));
 const result=await afterRestart.run();
 expect(result).toEqual({status:"CONFIRMED",evidence:"SERVER_CANCELLED_BY_USER",
  maySendCancelPost:false});
 expect(afterRestart.requests).toHaveLength(1);
 forbidPost(afterRestart.requests);
});
it("crash BEFORE POST (but after prepared receipt): active server stays UNKNOWN, no POST",async()=>{
 const s=simulate(receipt(),[page("PENDING_TRAINER_CONFIRMATION")]);
 expect(await s.run()).toMatchObject({status:"UNKNOWN",evidence:"SERVER_ACTIVE"});
 forbidPost(s.requests);expect(s.requests).toHaveLength(1);
});
it("server CONFIRMED active is NOT proof cancel failed, even if receipt says ACKED",async()=>{
 const s=simulate(receipt("ACKED"),[page("CONFIRMED")]);
 expect(await s.run()).toMatchObject({status:"UNKNOWN",evidence:"SERVER_ACTIVE"});
 forbidPost(s.requests);
});
it("server status cancellation by trainer/SLA/system is never labelled own CANCELLED_BY_USER",async()=>{
 for(const status of ["CANCELLED_BY_TRAINER","CANCELLED_BY_SLA","CANCELLED_BY_SYSTEM"]){
  const s=simulate(receipt("UNKNOWN"),[page(status)]);
  expect(await s.run()).toEqual({status:"SERVER_CHANGED",
   evidence:"SERVER_OTHER_TERMINAL",maySendCancelPost:false});
  forbidPost(s.requests);
 }
});
it("server COMPLETED and NO_SHOW are distinct terminal outcomes, not successful owner cancel",async()=>{
 for(const status of ["COMPLETED","NO_SHOW"]){
  const s=simulate(receipt(),[page(status)]);
  expect(await s.run()).toMatchObject({status:"SERVER_CHANGED",
   evidence:"SERVER_OTHER_TERMINAL"});
 }
});
it("missing booking in COMPLETE owner list is still UNKNOWN; omission never permits repeat POST",async()=>{
 const s=simulate(receipt(),[empty()]);
 expect(await s.run()).toEqual({status:"UNKNOWN",evidence:"GET_INCOMPLETE",
  maySendCancelPost:false});
 expect(s.requests).toHaveLength(1);
});
it("partial page missing booking must continue GET cursor, never infer from page one",async()=>{
 const s=simulate(receipt(),[empty("cursor_A"),cancelled]);
 expect(await s.run()).toMatchObject({status:"CONFIRMED"});
 expect(s.requests.map(r=>r.path)).toEqual([
  "/api/v1/consultations/my","/api/v1/consultations/my?cursor=cursor_A",
 ]);
 forbidPost(s.requests);
});
it("pagination cap with no matching item returns UNKNOWN even if nextCursor remains",async()=>{
 const pages=Array.from({length:5},(_,i)=>empty(`cursor_${i}`));
 const s=simulate(receipt(),pages);
 expect(await s.run()).toMatchObject({status:"UNKNOWN",evidence:"GET_INCOMPLETE"});
 expect(s.requests).toHaveLength(5);forbidPost(s.requests);
});
it("repeated server cursor cannot turn absence into confirmed or safe retry",async()=>{
 const s=simulate(receipt(),[empty("same_cursor"),empty("same_cursor")]);
 expect(await s.run()).toMatchObject({status:"UNKNOWN",evidence:"GET_INCOMPLETE"});
 expect(s.requests).toHaveLength(2);
});
it("GET error/timeout is UNKNOWN, without automatic retry or mutation",async()=>{
 const requestPage=vi.fn(async()=>{throw Error("PRIVATE_NETWORK_STACK");});
 const initial=context();
 const result=await reviewCancellationAfterRestart({rawReceipt:receipt(),
  session:initial,getSession:()=>initial,requestPage});
 expect(result).toEqual({status:"UNKNOWN",evidence:"GET_UNAVAILABLE",maySendCancelPost:false});
 expect(requestPage).toHaveBeenCalledTimes(1);
 expect(JSON.stringify(result)).not.toContain("PRIVATE_NETWORK_STACK");
});
it("invalid success JSON/unknown status/false success fails closed, not confirmed",async()=>{
 for(const response of [{success:false,data:{items:[],nextCursor:null}},
  {success:true,data:{items:[],nextCursor:undefined}},
  page("CANCELLED_UNKNOWN_STATUS"),
  {success:true,data:{items:"not-array",nextCursor:null}}]){
  const s=simulate(receipt(),[response]);
  expect(await s.run()).toMatchObject({status:"UNKNOWN",evidence:"INVALID_GET_DTO"});
 }
});
it("wrong trainer or slot on same booking id never proves cancellation",async()=>{
 for(const response of [page("CANCELLED_BY_USER",booking,{trainerId:"trainer_OTHER"}),
  page("CANCELLED_BY_USER",booking,{slotId:"slot_OTHER"})]){
  const s=simulate(receipt(),[response]);
  expect(await s.run()).toMatchObject({status:"UNKNOWN",
   evidence:"BOOKING_BINDING_MISMATCH"});
 }
});
it("foreign actor on fresh login never reads or uses a previous account receipt",async()=>{
 const s=simulate(receipt(),[cancelled],context("user_B"));
 expect(await s.run()).toMatchObject({status:"UNAVAILABLE",
  evidence:"UNTRUSTED_RECEIPT"});
 expect(s.requestPage).not.toHaveBeenCalled();
});
it("stale owner/epoch before GET prevents network even with valid persisted record",async()=>{
 const s=simulate();s.setSession(context(owner,"epoch_CHANGED"));
 expect(await s.run()).toMatchObject({status:"UNAVAILABLE",evidence:"STALE_SESSION"});
 expect(s.requestPage).not.toHaveBeenCalled();
});
it(
 "owner switch during delayed GET drops CANCELLED_BY_USER response without publishing",
 async()=>{
 const first=context();let live:VerifiedCancellationReader|null=first;
 let release!:(data:unknown)=>void;
 let entered!:(value:void)=>void;
 const started=new Promise<void>(resolve=>{entered=resolve;});
 const requestPage=vi.fn(async()=>{
  entered();
  return new Promise<unknown>(resolve=>{release=resolve;});
 });
 const job=reviewCancellationAfterRestart({rawReceipt:receipt(),
  session:first,getSession:()=>live,requestPage});
 await started;live=context("user_B","new_epoch",{id:"user_B"});
 release(cancelled);
 expect(await job).toEqual({status:"UNAVAILABLE",evidence:"STALE_SESSION",
  maySendCancelPost:false});
 expect(requestPage).toHaveBeenCalledTimes(1);
});
it("A→B→A with same owner and epoch but new actor object rejects stale late GET",async()=>{
 const initial=context(owner,"epoch_same",{id:owner});
 let now:VerifiedCancellationReader|null=initial;
 let release!:(data:unknown)=>void;
 const requestPage=vi.fn(async()=>new Promise<unknown>(resolve=>{release=resolve;}));
 const job=reviewCancellationAfterRestart({rawReceipt:receipt(),session:initial,
  getSession:()=>now,requestPage});
 await Promise.resolve();
 now=context("user_B","epoch_B",{id:"user_B"});
 now=context(owner,"epoch_same",{id:owner});
 release(cancelled);
 expect(await job).toMatchObject({status:"UNAVAILABLE",evidence:"STALE_SESSION"});
});
it("post-crash missing/cleared/tampered native receipt has no proof and no automatic GET",async()=>{
 for(const raw of [null,"garbage",{...receipt(),ownerId:"user_B"},
  {...receipt(),secret:"SENSITIVE_TOKEN"},{...receipt(),kind:"booking-tombstone"},
  {version:1,ownerId:owner,idempotencyKey:"uuid",state:"UNKNOWN"}]){
  const s=simulate(raw,[cancelled]);
  expect(await s.run()).toMatchObject({status:"UNAVAILABLE",evidence:"UNTRUSTED_RECEIPT"});
  expect(s.requestPage).not.toHaveBeenCalled();
 }
 // Explicit undefined passed to simulate() activates its default valid receipt,
 // so verify rejection at the actual validator boundary instead.
 expect(validateCancellationReceipt(undefined)).toBeNull();
});
it("old PREPARED receipt does not auto-expire into permission to resend",async()=>{
 const s=simulate({...receipt(),createdAt:1},[page("CONFIRMED")]);
 const res=await s.run();
 expect(res.maySendCancelPost).toBe(false);
 expect(res.status).toBe("UNKNOWN");
});
it("positive POST ACK must match exact original bookingId; wrong/missing/non-success cannot confirm",()=>{
 const p=receipt();
 expect(ackMatchesCancellationReceipt(p,{success:true,data:{bookingId:booking}})).toBe(true);
 for(const v of [{success:true,data:{bookingId:"booking_OTHER"}},
  {success:true,data:{}},{success:true,data:{bookingId:booking,secret:"LEAK"}},
  {success:false,data:{bookingId:booking}},null]){
  expect(ackMatchesCancellationReceipt(p,v)).toBe(false);
 }
});
it("receipt validates only cancellation-specific ID+slot+trainer proof, not V25 booking tombstone",()=>{
 expect(validateCancellationReceipt(receipt())).toEqual(receipt());
 for(const v of [{...receipt(),slotId:"../other"},
  {...receipt(),authEpochAtIntent:""},{...receipt(),phase:"CONFIRMED"},
  {...receipt(),bookingId:" "},{...receipt(),version:2},
  {...receipt(),createdAt:-1}]){
  expect(validateCancellationReceipt(v)).toBeNull();
 }
});
it("a new verified epoch for same owner MAY ONLY query GET, old epoch never authorizes cancel POST",async()=>{
 const session=context(owner,"fresh_new_epoch");
 const s=simulate(receipt("UNKNOWN"),[cancelled],session);
 expect(await s.run()).toMatchObject({status:"CONFIRMED",
  evidence:"SERVER_CANCELLED_BY_USER",maySendCancelPost:false});
 forbidPost(s.requests);
});
