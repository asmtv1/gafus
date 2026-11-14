import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({find:vi.fn(),lock:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{consultationBooking:{findFirst:m.find}}}));
import {readClientConsultationRestrictions,lockConsultationClient} from "./bookingEligibility.js";
const completedAt=new Date("2026-11-06T10:00:00Z");
beforeEach(()=>{vi.clearAllMocks();m.find.mockResolvedValue(null);});
describe("owner-scoped consultation availability persistence",()=>{
 it("checks a live booking across trainers before any completed booking lookup",async()=>{
  m.find.mockResolvedValueOnce({id:"active"});
  expect(await readClientConsultationRestrictions("actor")).toEqual({hasActiveBooking:true,lastCompletedAt:null});
  expect(m.find).toHaveBeenCalledExactlyOnceWith({where:{clientId:"actor",status:{in:["PENDING_TRAINER_CONFIRMATION","CONFIRMED"]}},select:{id:true}});
 });
 it("last completed timestamp is scoped to the same client",async()=>{
  m.find.mockResolvedValueOnce(null).mockResolvedValueOnce({completedAt});
  expect(await readClientConsultationRestrictions("actor")).toEqual({hasActiveBooking:false,lastCompletedAt:completedAt});
  expect(m.find.mock.calls[1]?.[0]).toEqual({where:{clientId:"actor",status:"COMPLETED",completedAt:{not:null}},orderBy:{completedAt:"desc"},select:{completedAt:true}});
 });
 it("injects the exact active transaction delegate without using a second connection",async()=>{
  const own=vi.fn().mockResolvedValueOnce({id:"active"});
  expect(await readClientConsultationRestrictions("actor",{consultationBooking:{findFirst:own}} as never)).toEqual({hasActiveBooking:true,lastCompletedAt:null});
  expect(m.find).not.toHaveBeenCalled();expect(own).toHaveBeenCalledOnce();
 });
 it("missing actor fails closed before querying or acquiring any lock",async()=>{
  await expect(readClientConsultationRestrictions("")).rejects.toThrow("CONSULTATION_CLIENT_ID_REQUIRED");
  await expect(lockConsultationClient({$queryRaw:m.lock} as never,"")).rejects.toThrow("CONSULTATION_CLIENT_ID_REQUIRED");
  expect(m.find).not.toHaveBeenCalled();expect(m.lock).not.toHaveBeenCalled();
 });
 it("lock is only issued on the caller's current Prisma transaction",async()=>{
  await lockConsultationClient({$queryRaw:m.lock} as never,"actor");
  expect(m.lock).toHaveBeenCalledOnce();
 });
});
