import {afterEach,describe,expect,it,vi} from "vitest";
import {createConsultationBooking,verifyBookingSlot,cancelConsultationBooking,recoverConsultationBooking,
  prepareConsultationCall,admitConsultationCall,signConsultationCall} from "./consultationLiveApi";
const key="12345678-1234-4567-89ab-123456789abc";
const body={slotId:"slotA",idempotencyKey:key,clientOwnerName:"Ирина",clientPhone:"+79991234567",
  petName:"Рекс",petGender:"MALE" as const,petAge:"2 года",petBreed:"Корги",
  clientProblem:"Не слушается на улице",clientSelfHelpAttempt:"Учили команды"};
const ok=(data:unknown,status=200)=>new Response(JSON.stringify({success:true,data}),{status});
afterEach(()=>vi.unstubAllGlobals());
describe("live Hono consultation mutations",()=>{
  it("verifies and books only exact identifiers with credentials",async()=>{
    const fetch=vi.fn(async (path:string,opts:RequestInit)=>path.endsWith("/verify")?
      new Response(JSON.stringify({success:true}),{status:200}):
      ok({kind:"created",booking:{id:"bookingA"}},201));
    vi.stubGlobal("fetch",fetch);
    await verifyBookingSlot("trainerA","slotA");
    expect((await createConsultationBooking(body)).booking.id).toBe("bookingA");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe("/api/v1/consultations/book");
    expect(fetch.mock.calls[1][1]).toEqual(expect.objectContaining({method:"POST",credentials:"include",cache:"no-store"}));
    expect(fetch.mock.calls[1][1].headers).toEqual(expect.objectContaining({"X-Gafus-Auth-Transport":"cookie"}));
    expect(JSON.parse(String(fetch.mock.calls[1][1].body))).toEqual(body);
  });
  it("never posts on invalid slot or booking key",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    expect(()=>verifyBookingSlot("../../admin","slotA")).toThrow();
    expect(()=>createConsultationBooking({...body,idempotencyKey:"bad"})).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("owner cancel and lost ACK lookup use isolated POSTs",async()=>{
    const fetch=vi.fn(async (path:string)=>path.includes("lookup")?
      ok({state:"FOUND",booking:{id:"bookingA"}}):ok({bookingId:"bookingA"}));
    vi.stubGlobal("fetch",fetch);
    expect((await cancelConsultationBooking("bookingA")).bookingId).toBe("bookingA");
    expect((await recoverConsultationBooking(key)).state).toBe("FOUND");
    expect(fetch.mock.calls[1][0]).toBe("/api/v1/consultations/book/lookup");
  });
  it("VoIP preparer/admission/sign use ephemeral response, no long-lived key",async()=>{
    const fetch=vi.fn(async (path:string)=>path.endsWith("prepare")?
      ok({username:"test@example",room:"room-1"}):path.endsWith("admission")?
      ok({admission:"ephemeral",expires:5}):
      new Response(JSON.stringify({success:true,token:"signed"}),{status:200}));
    vi.stubGlobal("fetch",fetch);
    expect((await prepareConsultationCall("bookingA")).success).toBe(true);
    expect((await admitConsultationCall("bookingA")).success).toBe(true);
    expect(await signConsultationCall("bookingA","validkey-123")).toEqual({success:true,token:"signed"});
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
