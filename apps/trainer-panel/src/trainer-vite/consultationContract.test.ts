import { describe, expect, it } from "vitest";
import { trainerStaffMethods, staffViewAllowed, parseStaffHttp, buildTrainerStaffRequest } from "./consultationContract";
const cache="private, no-store";
const booking={ id:"b1",status:"CONFIRMED",slot:{id:"s1",startAtUtc:"2026-10-17T10:00:00Z",endAtUtc:"2026-10-17T10:30:00Z"},cynologistUserId:"trainer-A",confirmationDeadlineAt:"2026-10-17T09:00:00Z",createdAt:"2026-10-16T08:00:00Z"};
function dataFor(kind:string){if(kind==="bookings")return [booking];if(kind==="bookingId")return {bookingId:"b1"};if(kind==="availability")return {slotDurationMin:30,rules:[],dayOffs:[],exceptions:[]};return {};}
describe("AG4 Trainer 11 actual Hono DTO contracts (mock-only)",()=>{
 it("maps all 11 exact methods without fabricated pagination or staff 429",()=>{expect(trainerStaffMethods.map(x=>x.id)).toEqual([1,2,3,4,5,6,7,8,9,10,11]);});
 for(const descriptor of trainerStaffMethods){
  it(`method ${descriptor.id} accepts exact 200 envelope; rejects incomplete data`,()=>{
   expect(parseStaffHttp(descriptor,200,{success:true,data:dataFor(descriptor.result)},cache)).toEqual(dataFor(descriptor.result));
   expect(()=>parseStaffHttp(descriptor,200,{success:true},cache)).toThrow("INVALID_RESPONSE");
   expect(()=>parseStaffHttp(descriptor,200,{success:true,data:{items:[],nextCursor:null}},cache)).toThrow("INVALID_RESPONSE");
  });
 }
 it("full availability required, not rules-only",()=>expect(()=>parseStaffHttp(trainerStaffMethods[5],200,{success:true,data:{rules:[]}},cache)).toThrow());
 it("foreign trainer and moderator fail closed in UI; ADMIN optional target",()=>{
  expect(staffViewAllowed({role:"TRAINER",id:"a"},trainerStaffMethods[5],"b")).toBe(false);
  expect(staffViewAllowed({role:"TRAINER",id:"a"},trainerStaffMethods[5],"a")).toBe(true);
  expect(staffViewAllowed({role:"MODERATOR",id:"m"},trainerStaffMethods[5])).toBe(false);
  expect(staffViewAllowed({role:"ADMIN",id:"admin"},trainerStaffMethods[5],"a")).toBe(true);
 });
 for(const status of [400,401,403,404,409,500])it(`status ${status} is never success`,()=>expect(()=>parseStaffHttp(trainerStaffMethods[0],status,{success:false,error:"Отказано"},cache)).toThrow(`STAFF_HTTP_${status}`));
 it("429 not promised, malformed envelope and cache are denied",()=>{
  expect(()=>parseStaffHttp(trainerStaffMethods[0],429,{success:false,error:"Rate limit"},cache)).toThrow("INVALID_RESPONSE");
  expect(()=>parseStaffHttp(trainerStaffMethods[0],200,{success:true,data:[]},null)).toThrow("UNSAFE_CACHE");
 });
});

describe("AG4 trainer 11 request DTO fixtures",()=>{
 const actor={role:"TRAINER" as const,id:"a"};
 it("all 11 registered routes generate exact method+path and no implicit network",()=>{
  const bodies:Record<number,unknown>={5:{reason:"нет"},7:{rules:[{weekday:1,startTime:"09:00",endTime:"10:00"}]},8:{date:"2026-10-17"},10:{startAt:"2026-10-17T08:00:00Z",endAt:"2026-10-17T09:00:00Z"}};
  for(const d of trainerStaffMethods){const x=buildTrainerStaffRequest(d,actor,{resourceId:"booking1",body:bodies[d.id]});expect(x.method).toBe(d.method);expect(x.path).toBe(`/api/v1/consultations${d.route.replace(/:[a-zA-Z]+Id/,"booking1")}`);}
 });
 it("rejects foreign target, malicious IDs, invalid rules and invalid chronological dates",()=>{
  expect(()=>buildTrainerStaffRequest(trainerStaffMethods[5],actor,{targetTrainerId:"b"})).toThrow("ROLE_DENIED");
  expect(()=>buildTrainerStaffRequest(trainerStaffMethods[1],actor,{resourceId:"../outside"})).toThrow("INVALID_RESOURCE_ID");
  expect(()=>buildTrainerStaffRequest(trainerStaffMethods[6],actor,{body:{rules:[]}})).toThrow("INVALID_BODY");
  expect(()=>buildTrainerStaffRequest(trainerStaffMethods[9],actor,{body:{startAt:"2026-10-17T11:00:00Z",endAt:"2026-10-17T10:00:00Z"}})).toThrow("INVALID_BODY");
 });
 it("ADMIN target query only for staff scheduling; no client-provided owner for Trainer",()=>{
  const admin={role:"ADMIN" as const,id:"admin"};
  expect(buildTrainerStaffRequest(trainerStaffMethods[5],admin,{targetTrainerId:"a"}).path).toBe("/api/v1/consultations/trainer/availability?trainerUserId=a");
  expect(buildTrainerStaffRequest(trainerStaffMethods[0],admin,{targetTrainerId:"a"}).path).not.toContain("trainerUserId");
 });
});
