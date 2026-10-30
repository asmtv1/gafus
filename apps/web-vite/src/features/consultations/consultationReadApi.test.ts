import {afterEach,describe,expect,it,vi} from "vitest";
import {
  consultationRange,getMyConsultations,getSpecialistSlots,getSpecialistCalendarSlots,getSpecialists,
  mskLabel,projectCatalog,projectMyBookings,projectSlots,safePublicCynologistAvatar,
} from "./consultationReadApi";
const eligibility={canBook:true,reason:null,nextBookingAt:null,message:null};
const specialist=(overrides:Record<string,unknown>={})=>({
  id:"cy1",userId:"trainer1",username:"trainer_a",
  displayName:"Кинолог Анна",about:"Поведение",avatarUrl:"S3_SECRET",
  slotDurationMin:45,...overrides,
});
const slot=(overrides:Record<string,unknown>={})=>({
  id:"s1",startAtUtc:"2026-10-19T08:00:00.000Z",
  endAtUtc:"2026-10-19T08:45:00.000Z",status:"FREE",...overrides,
});
const booking=(overrides:Record<string,unknown>={})=>({
  id:"b1",status:"CONFIRMED",slot:slot({status:"BOOKED"}),
  cynologistUserId:"trainer1",cynologistDisplayName:"Кинолог Анна",
  clientUsername:"ownerA",clientOwnerName:"Имя владельца",
  clientPhone:"+79000000000",petName:"Шарик",petGender:"MALE",
  petAge:"2 года",petBreed:"Такса",clientProblem:"Секретная проблема",
  clientSelfHelpAttempt:"Секретная попытка",cancelReason:null,
  confirmationDeadlineAt:"2026-10-19T00:00:00.000Z",
  createdAt:"2026-10-17T12:00:00.000Z",...overrides,
});
const response=(data:unknown,meta:Record<string,unknown>={})=>
  new Response(JSON.stringify({success:true,data,...meta}),{status:200});
afterEach(()=>vi.unstubAllGlobals());
describe("G11-G13 consultation user read-only Hono client",()=>{
  it("C-A01 GET catalog no POST; eligibility server-derived",async()=>{
    const fetch=vi.fn().mockImplementation(()=>
      Promise.resolve(response([specialist()],{bookingEligibility:eligibility})));
    vi.stubGlobal("fetch",fetch);
    const catalog=await getSpecialists();
    expect(catalog.items[0].name).toBe("Кинолог Анна");
    expect(catalog.eligibility.canBook).toBe(true);
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/consultations/cynologists");
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method:"GET",credentials:"include",cache:"no-store",
    });
    expect(JSON.stringify(catalog)).not.toContain("S3_SECRET");
  });
  it("C-A02 malformed/duplicate specialists fail, no raw role/avatar",()=>{
    expect(()=>projectCatalog([specialist(),specialist()],eligibility)).toThrow();
    expect(()=>projectCatalog([specialist({userId:"../foreign"})],eligibility)).toThrow();
    expect(()=>projectCatalog([specialist()],{...eligibility,canBook:"yes"})).toThrow();
  });
  it("C-A03 tomorrow Moscow start, day15 end",()=>{
    const range=consultationRange(new Date("2026-10-17T16:00:00Z"));
    expect(range.from).toBe("2026-10-17T21:00:00.000Z");
    expect(range.to).toBe("2026-11-01T20:59:59.999Z");
    expect(mskLabel("2026-10-19T08:00:00.000Z")).toContain("11:00");
  });
  it("C-A04 GET slots uses encoded ISO and FREE only",async()=>{
    const fetch=vi.fn().mockImplementation(()=>
      Promise.resolve(response([
        slot({id:"busy",status:"BOOKED"}),slot(),slot({id:"off",status:"BLOCKED"}),
      ],{bookingEligibility:{...eligibility,canBook:false,reason:"ACTIVE_BOOKING",
        message:"Уже есть запись"}})));
    vi.stubGlobal("fetch",fetch);
    const range={from:"2026-10-18T00:00:00.000Z",to:"2026-10-31T23:59:59.999Z"};
    const data=await getSpecialistSlots("trainer1",range);
    expect(data.items.map(x=>x.id)).toEqual(["s1"]);
    expect(data.eligibility.reason).toBe("ACTIVE_BOOKING");
    expect(fetch.mock.calls[0][0]).toContain(
      "/cynologists/trainer1/slots?from=2026-10-18T00%3A00%3A00.000Z");
    expect(fetch.mock.calls[0][0]).toContain("&includeBusy=0");
    expect(fetch.mock.calls[0][1].method).toBe("GET");
  });
  it("C-A05 slot duplicate/invalid duration/status rejects",()=>{
    expect(()=>projectSlots([slot(),slot()],eligibility)).toThrow();
    expect(()=>projectSlots([slot({status:"INVALID"})],eligibility)).toThrow();
    expect(()=>projectSlots([slot({endAtUtc:"2026-10-18T00:00:00Z"})],
      eligibility)).toThrow();
  });
  it("WEB5 source Next GET calendar: busy slots, trainer days off, owner-safe fields",async()=>{
    const fetch=vi.fn().mockImplementation(()=>Promise.resolve(response([
      {...slot(),clientPhone:"DO_NOT_EXPOSE",clientOwnerName:"PRIVATE"},
      slot({id:"busy",status:"BOOKED"}),
      slot({id:"blocked",status:"BLOCKED"}),
    ],{bookingEligibility:eligibility,dayOffDates:["2026-10-20"]})));
    vi.stubGlobal("fetch",fetch);
    const range=consultationRange(new Date("2026-10-17T16:00:00Z"));
    const data=await getSpecialistCalendarSlots("trainer1",range);
    expect(data.items.map(x=>x.status)).toEqual(["FREE","BOOKED","BLOCKED"]);
    expect(data.dayOffDates).toEqual(["2026-10-20"]);
    expect(fetch.mock.calls[0][0]).toContain("&includeBusy=1");
    expect(fetch.mock.calls[0][1]).toMatchObject({method:"GET",credentials:"include"});
    expect(JSON.stringify(data)).not.toMatch(/DO_NOT_EXPOSE|PRIVATE/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("WEB5 source Next GET calendar rejects malformed day-offs and duplicates",async()=>{
    const fetch=vi.fn().mockImplementation(()=>Promise.resolve(response([slot()],{
      bookingEligibility:eligibility,dayOffDates:["2026-10-20","2026-10-20"],
    })));
    vi.stubGlobal("fetch",fetch);
    const range=consultationRange(new Date("2026-10-17T16:00:00Z"));
    await expect(getSpecialistCalendarSlots("trainer1",range)).rejects.toThrow(
      "DUPLICATE_CONSULTATION_CALENDAR_DAYS_OFF");
    fetch.mockImplementation(()=>Promise.resolve(response([slot()],{
      bookingEligibility:eligibility,dayOffDates:["../other-account"],
    })));
    await expect(getSpecialistCalendarSlots("trainer1",range)).rejects.toThrow(
      "INVALID_CONSULTATION_CALENDAR_DAYS_OFF");
    fetch.mockImplementation(()=>Promise.resolve(response([slot(),slot()],{
      bookingEligibility:eligibility,dayOffDates:[],
    })));
    await expect(getSpecialistCalendarSlots("trainer1",range)).rejects.toThrow(
      "DUPLICATE_CONSULTATION_SLOT");
  });
  it("C-A06 GET mine cursor limit 20; private intake stripped",async()=>{
    const fetch=vi.fn().mockImplementation(()=>
      Promise.resolve(response({items:[booking()],nextCursor:"b1"})));
    vi.stubGlobal("fetch",fetch);
    const result=await getMyConsultations("ownerA");
    expect(result.items[0]).toMatchObject({
      status:"CONFIRMED",cynologistName:"Кинолог Анна",
      clientOwnerName:"Имя владельца",petName:"Шарик",
    });
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/consultations/my?limit=20");
    expect(JSON.stringify(result)).not.toMatch(/79000000000|Секретн/);
    await getMyConsultations("ownerA","b1");
    expect(fetch.mock.calls[1][0]).toBe(
      "/api/v1/consultations/my?limit=20&cursor=b1");
    expect(fetch.mock.calls.every(([_,o])=>o.method==="GET")).toBe(true);
  });
  it("C-A07 cross-owner, duplicate booking, invalid cursor rejected",()=>{
    expect(()=>projectMyBookings({items:[booking({clientUsername:"ownerB"})],
      nextCursor:null},"ownerA")).toThrow();
    expect(()=>projectMyBookings({items:[booking(),booking()],
      nextCursor:null},"ownerA")).toThrow();
    expect(()=>projectMyBookings({items:[booking()],
      nextCursor:"../private"},"ownerA")).toThrow();
  });
  it("C-A08 invalid username/slot range rejected before network",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    await expect(getMyConsultations("../B")).rejects.toThrow();
    await expect(getSpecialistSlots("../trainer",{
      from:"2026-10-18T00:00:00Z",to:"2026-10-19T00:00:00Z",
    })).rejects.toThrow();
    await expect(getSpecialistSlots("trainer1",{
      from:"2026-10-19T00:00:00Z",to:"2026-10-18T00:00:00Z",
    })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("C-A09 401/402/403 bounded errors never display backend body",async()=>{
    for(const status of [401,402,403]){
      vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(
        JSON.stringify({success:false,error:"SENSITIVE_BACKEND_STACK",
          code:"DENIED"}),{status})));
      await expect(getSpecialists()).rejects.toMatchObject({status,code:"DENIED"});
    }
  });
});


describe("LIVE NEXT trainer portraits",()=>{
  it("renders only a trusted public avatar from the established CDN",()=>{
    const key="uploads/users/trainer1/avatar.webp";
    const full="https://storage.yandexcloud.net/gafus-media/"+key;
    expect(safePublicCynologistAvatar(key)).toBe(full);
    expect(safePublicCynologistAvatar(full)).toBe(full);
    expect(projectCatalog([specialist({avatarUrl:key})],eligibility).items[0]?.avatarUrl)
      .toBe(full);
  });
  it("rejects unrelated hosts, raw secret fields and traversal",()=>{
    const invalid=["S3_SECRET","../other/avatar.webp","https://example.org/image.jpg",
      "uploads/users/trainer1/../other.webp", "uploads/users/trainer1/%2e.webp"];
    for(const value of invalid) expect(safePublicCynologistAvatar(value)).toBeNull();
    expect(projectCatalog([specialist()],eligibility).items[0]?.avatarUrl).toBeNull();
  });
});
