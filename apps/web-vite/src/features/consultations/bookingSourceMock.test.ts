import {describe,it,expect} from "vitest";
import {classifyMockBooking,classifyMockReadback,prepareBookingIntent,uuidV4}
  from "./bookingSourceMock";
import type {BookMockReply,BookingIntake} from "./bookingSourceMock";
const slot={id:"slot1",startAtUtc:"2026-10-19T08:00:00.000Z",
  endAtUtc:"2026-10-19T08:45:00.000Z",status:"FREE" as const};
const specialist={id:"cy1",userId:"trainer1",username:"trainer_a",
  name:"Анна",about:null,slotDurationMin:45};
const reply=(status=201,kind:"created"|"idempotent_replay"="created"):
BookMockReply=>({httpStatus:status,success:true,data:{
  kind,booking:{id:"booking1",status:"PENDING_TRAINER_CONFIRMATION",
    slot,cynologistUserId:"trainer1",clientUsername:"ownerA"},
}});
const form:BookingIntake={clientOwnerName:"  Ирина  ",clientPhone:"+79991234567",
  petName:" Шарик ",petGender:"MALE",petAge:" 2 года ",petBreed:" такса ",
  clientProblem:"Проблема на прогулке",clientSelfHelpAttempt:"Пробовали обучение"};
const uuid="12345678-1234-4567-89ab-123456789abc";
describe("G11 real Hono idempotency source, synthetic-only",()=>{
  it("A01 UUIDv4 and exact known fields, no invented clientRequestId",()=>{
    expect(uuidV4(uuid)).toBe(true);
    expect(uuidV4("idem-1")).toBe(false);
    const data=prepareBookingIntent(form,"slot1",uuid);
    expect(data?.clientOwnerName).toBe("Ирина");
    expect(Object.keys(data??{}).sort()).toEqual([
      "slotId","idempotencyKey","clientOwnerName","clientPhone","petName",
      "petGender","petAge","petBreed","clientProblem","clientSelfHelpAttempt",
    ].sort());
  });
  it("A02 exact 201 created ACK only means synthetic result",()=>{
    expect(classifyMockBooking(reply(),slot,specialist,"ownerA"))
      .toEqual({kind:"ACK_MOCK",mockBookingId:"booking1",serverKind:"created"});
  });
  it("A03 200 idempotent_replay accepted, 200 created UNKNOWN",()=>{
    expect(classifyMockBooking(reply(200,"idempotent_replay"),
      slot,specialist,"ownerA").kind).toBe("ACK_MOCK");
    expect(classifyMockBooking(reply(200,"created"),slot,specialist,"ownerA"))
      .toEqual({kind:"UNKNOWN"});
  });
  it("A04 wrong owner/trainer/slot cannot attach another booking",()=>{
    for(const patch of [
      {slot:{...slot,id:"other"}},{cynologistUserId:"trainer2"},
      {clientUsername:"other"},{id:"../bad"},
    ]){
      const bad=reply();
      bad.data!.booking={...bad.data!.booking,...patch};
      expect(classifyMockBooking(bad,slot,specialist,"ownerA"))
        .toEqual({kind:"UNKNOWN"});
    }
  });
  it("A05 conflict, denied, server error and invalid ACK differ",()=>{
    expect(classifyMockBooking({httpStatus:409,success:false},
      slot,specialist,"ownerA").kind).toBe("SLOT_CONFLICT");
    expect(classifyMockBooking({httpStatus:403,success:false},
      slot,specialist,"ownerA")).toEqual({kind:"DENIED",status:403});
    expect(classifyMockBooking({httpStatus:500,success:false},
      slot,specialist,"ownerA")).toEqual({kind:"UNKNOWN"});
    expect(classifyMockBooking({httpStatus:201,success:true},
      slot,specialist,"ownerA")).toEqual({kind:"UNKNOWN"});
  });
  it("A06 missing booking in readback never proves failure",()=>{
    expect(classifyMockReadback([{items:[],nextCursor:"more"}],
      null)).toBe("NOT_PROVEN");
  });
});
