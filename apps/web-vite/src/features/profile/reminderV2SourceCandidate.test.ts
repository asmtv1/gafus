import {describe,expect,it} from "vitest";
import {ApiError} from "../../shared/api/client";
import {classifyV2Create,classifyV2CreateError,classifyV2Lookup,makeReminderV2Journal,
 reminderV2Key,reminderV2LookupPath,reminderV2Payload,
 REMINDER_V2_FIXTURE} from "./reminderV2SourceCandidate";
const key="f003b513-ae45-4f09-92db-0f4874b67e81";
const body={name:" Прогулка ",reminderTime:"19:30",
 reminderDays:"1,2,5",timezone:"Europe/Moscow"};
const server={id:"rem_01",name:" Прогулка ",reminderTime:"19:30",
 reminderDays:"1,2,5",timezone:"Europe/Moscow",enabled:true};
describe("AG2 Reminder V2 approved header UUID only, no G05 JSON clientRequestId",()=>{
 it("V2S01 key validation and path reject wrong version/non-ASCII/traversal",()=>{
  expect(reminderV2Key(key)).toBe(key);
  expect(reminderV2LookupPath(key)).toBe("/api/v1/reminders/operations/"+key);
  for(const value of ["","REMINDER","../../../","f003b513-ae45-1f09-92db-0f4874b67e81",
   "f003b513-ae45-4f09-12db-0f4874b67e81",key+"?userId=B"]){
   expect(()=>reminderV2Key(value)).toThrow();
  }
 });
 it("V2S02 immutable exactly original JSON fields, not owner/body key",()=>{
  const payload=reminderV2Payload(body);
  expect(Object.keys(payload).sort()).toEqual([
   "name","reminderDays","reminderTime","timezone"]);
  expect(payload).toEqual(body);
  expect(payload).not.toHaveProperty("clientRequestId");
  expect(payload).not.toHaveProperty("Idempotency-Key");
  expect(payload).not.toHaveProperty("ownerId");
  expect(Object.isFrozen(payload)).toBe(true);
 });
 it("V2S03 operation journal one owner, one UUID, exact body across remount",()=>{
  const j=makeReminderV2Journal();
  const before=j.begin("A",body,key);
  expect(before?.idempotencyKey).toBe(key);
  expect(before?.body).toEqual(body);
  expect(before?.status).toBe("UNKNOWN");
  expect(j.begin("A",{...body,name:"Другой"},key)).toBeNull();
  expect(j.begin("B",body,key)).toBeNull();
  expect(j.read("B")).toBeNull();
  expect(j.read("A")).toEqual(before);
  j.set("A","ACK_MOCK");expect(j.read("A")?.status).toBe("ACK_MOCK");
  j.set("B","UNKNOWN");expect(j.read("A")?.status).toBe("ACK_MOCK");
 });
 it("V2S04 manual owner lookup once for UNKNOWN, never after terminal",()=>{
  const j=makeReminderV2Journal();
  j.begin("A",body,key);
  expect(j.takeLookup("B")).toBeNull();
  expect(j.takeLookup("A")?.idempotencyKey).toBe(key);
  expect(j.takeLookup("A")).toBeNull();
  j.set("A","LOOKUP_UNKNOWN");
  expect(j.takeLookup("A")).toBeNull();
 });
 it.each([
  [400,"REMINDER_LIMIT_REACHED","REJECTED_CAP"],
  [409,"REMINDER_IDEMPOTENCY_CONFLICT","CONFLICT_TERMINAL"],
  [409,"REMINDER_OPERATION_UNKNOWN","UNKNOWN"],
  [401,"UNAUTHORIZED","REJECTED"],
  [429,"RATE_LIMITED","REJECTED"],
 ])("V2S05 HTTP %s %s => %s", (status,code,kind)=>{
  expect(classifyV2Create({httpStatus:status,success:false,code},body).kind)
   .toBe(kind);
 });
 it("V2S06 bare409/mismatched201/invalid200 remain UNKNOWN",()=>{
  expect(classifyV2Create({httpStatus:409,success:false},body).kind)
   .toBe("UNKNOWN");
  expect(classifyV2Create({httpStatus:201,success:true,data:server},body).kind)
   .toBe("UNKNOWN");
  expect(classifyV2Create({httpStatus:200,success:true,data:{
   ...server,reminderTime:"19:31"}},body).kind).toBe("UNKNOWN");
  expect(classifyV2Create({httpStatus:200,success:true,data:server},body).kind)
   .toBe("ACK_MOCK");
 });
 it("V2S07 COMMITTED only for same original payload and valid DTO",()=>{
  const good={httpStatus:200,success:true,data:{status:"COMMITTED",reminder:server}};
  expect(classifyV2Lookup(good,body)).toBe("LOOKUP_COMMITTED");
  expect(classifyV2Lookup({httpStatus:200,success:true,data:{
   status:"COMMITTED",reminder:{...server,name:"Второй"},
  }},body)).toBe("LOOKUP_UNKNOWN");
  expect(classifyV2Lookup({httpStatus:404,success:false,code:"REMINDER_OPERATION_UNKNOWN"},body))
   .toBe("LOOKUP_UNKNOWN");
  expect(classifyV2Lookup({httpStatus:200,success:true,data:{
   status:"PENDING",reminder:server}},body)).toBe("LOOKUP_UNKNOWN");
 });
 it("V2S09 ordinary ApiError 400CAP/409CONFLICT vs 409UNKNOWN without raw message",()=>{
  expect(classifyV2CreateError(new ApiError(400,"SECRET_CAP",
   "REMINDER_LIMIT_REACHED"))).toEqual({kind:"REJECTED_CAP",status:400});
  expect(classifyV2CreateError(new ApiError(409,"SECRET_CONFLICT",
   "REMINDER_IDEMPOTENCY_CONFLICT"))).toEqual({
   kind:"CONFLICT_TERMINAL",status:409});
  expect(classifyV2CreateError(new ApiError(409,"SECRET_UNKNOWN",
   "REMINDER_OPERATION_UNKNOWN"))).toEqual({kind:"UNKNOWN",status:409});
  expect(classifyV2CreateError(new ApiError(503,"SECRET_SERVER","INTERNAL_ERROR")))
   .toEqual({kind:"UNKNOWN"});
  expect(classifyV2CreateError(Error("SECRET_NETWORK"))).toEqual({kind:"UNKNOWN"});
 });
 it("V2S08 source fixture literal separate from G05 and memory reset",()=>{
  const j=makeReminderV2Journal();j.begin("A",body,key);
  j.clear();expect(j.read("A")).toBeNull();
  expect(REMINDER_V2_FIXTURE).toBe("AG2_REMINDER_V2_HEADER_SYNTHETIC_ONLY");
  expect(REMINDER_V2_FIXTURE).not.toContain("PET");
 });
});
