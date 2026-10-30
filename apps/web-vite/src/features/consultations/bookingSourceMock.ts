import type {Slot,Specialist,BookingsPage} from "./consultationReadApi";

/** Frozen existing Hono body: POST /api/v1/consultations/book.
 * No clientRequestId exists. Never expose a real HTTP adapter in this module.
 */
export type BookingIntake={
  clientOwnerName:string;clientPhone:string;petName:string;
  petGender:"MALE"|"FEMALE";petAge:string;petBreed:string;
  clientProblem:string;clientSelfHelpAttempt:string;
};
export type BookingRequest=BookingIntake&{
  slotId:string;idempotencyKey:string;
};
export type VerifyMockReply={
  httpStatus:number;success:boolean;code?:string;
};
export type BookMockReply={
  httpStatus:number;success:boolean;code?:string;
  data?:{
    kind:"created"|"idempotent_replay";
    booking:{id:string;status:string;slot:Slot;
      cynologistUserId:string;clientUsername:string|null};
  };
};
/** Explicit in-process synthetic-only fixture; do NOT supply HTTP clients,
 * fetch or real csrf credentials. Missing fixture disables booking UI.
 */
export type BookingSourceMockTransport={
  fixtureKind:"AG2_BOOKING_SYNTHETIC_ONLY";
  verifySlot:(args:{
    cynologistUserId:string;slotId:string;
  })=>Promise<VerifyMockReply>;
  submitBooking:(args:{
    body:BookingRequest;
    cynologistUserId:string;
  })=>Promise<BookMockReply>;
  readbackMy:(username:string,cursor:string|null)=>Promise<BookingsPage>;
};
export const uuidV4=(raw:string):boolean=>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
const normalized=(s:string)=>s.trim();
const short=(s:string)=>normalized(s).length>=2&&normalized(s).length<=15;
const validPhone=(phone:string)=>/^\+?[0-9\s()-]{10,24}$/.test(phone.trim())&&
  phone.replace(/\D/g,"").length>=10&&phone.replace(/\D/g,"").length<=15;
export function prepareBookingIntent(intake:BookingIntake,slotId:string,
  idempotencyKey:string):BookingRequest|null{
  if(!short(intake.clientOwnerName)||!short(intake.petName)||
    !validPhone(intake.clientPhone)||!["MALE","FEMALE"].includes(intake.petGender)||
    !normalized(intake.petAge)||normalized(intake.petAge).length>100||
    !normalized(intake.petBreed)||normalized(intake.petBreed).length>200||
    normalized(intake.clientProblem).length<10||
    normalized(intake.clientProblem).length>1000||
    !normalized(intake.clientSelfHelpAttempt)||
    normalized(intake.clientSelfHelpAttempt).length>1000||
    !/^[A-Za-z0-9_-]{1,128}$/.test(slotId)||!uuidV4(idempotencyKey))
    return null;
  return {slotId,idempotencyKey,
    clientOwnerName:normalized(intake.clientOwnerName),
    clientPhone:normalized(intake.clientPhone),
    petName:normalized(intake.petName),petGender:intake.petGender,
    petAge:normalized(intake.petAge),petBreed:normalized(intake.petBreed),
    clientProblem:normalized(intake.clientProblem),
    clientSelfHelpAttempt:normalized(intake.clientSelfHelpAttempt)};
}
export type BookingResult=
  |{kind:"ACK_MOCK";mockBookingId:string;serverKind:"created"|"idempotent_replay"}
  |{kind:"SLOT_CONFLICT"}
  |{kind:"DENIED";status:number}
  |{kind:"UNKNOWN"};
/** Safe classification: only exact ACK shape proves a *synthetic* success.
 * 500/503, invalid JSON, thrown network/lost ACK are UNKNOWN, never retry.
 */
export function classifyMockBooking(reply:BookMockReply,slot:Slot,
  specialist:Specialist,username:string):BookingResult{
  if(reply.httpStatus===409||reply.code==="CONSULTATION_SLOT_TAKEN")
    return {kind:"SLOT_CONFLICT"};
  if([400,401,402,403,404,422,429].includes(reply.httpStatus)&&
    reply.success===false)return {kind:"DENIED",status:reply.httpStatus};
  const data=reply.data;
  if(reply.success===true&&
    (reply.httpStatus===201&&data?.kind==="created"||
      reply.httpStatus===200&&data?.kind==="idempotent_replay")&&
    data?.booking&&/^[A-Za-z0-9_-]{1,128}$/.test(data.booking.id)&&
    data.booking.slot?.id===slot.id&&
    data.booking.cynologistUserId===specialist.userId&&
    data.booking.clientUsername===username&&
    ["PENDING_TRAINER_CONFIRMATION","CONFIRMED"].includes(data.booking.status)){
    return {kind:"ACK_MOCK",mockBookingId:data.booking.id,serverKind:data.kind};
  }
  return {kind:"UNKNOWN"};
}
/** GET /my is cursor paginated and has no idempotencyKey predicate.
 * A missing item is NOT proof of failure; a matching ID only confirms
 * a previously ACKed mock. All uncertain writes remain non-retryable.
 */
export function classifyMockReadback(pages:BookingsPage[],
  knownBookingId:string|null):"FOUND_MOCK"|"NOT_PROVEN"{
  if(knownBookingId&&pages.some(p=>p.items.some(x=>x.id===knownBookingId)))
    return "FOUND_MOCK";
  return "NOT_PROVEN";
}
