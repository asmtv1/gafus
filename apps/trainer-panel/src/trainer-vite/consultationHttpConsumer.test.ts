import { describe, expect, it, vi } from "vitest";
import { callTrainerConsultationMethod } from "./consultationHttpConsumer";
import { trainerStaffMethods } from "./consultationContract";
const actor = { role: "TRAINER" as const, id: "owner-A" };
function reply(status: number, data: unknown, cache = "private, no-store") {
  return new Response(JSON.stringify(data), { status, headers: { "cache-control": cache } });
}
describe("AG4 Trainer actual fetch-consumer transport boundary, no network", () => {
  it("sends one authenticated POST with exact path and JSON, parses 200 bookingId", async () => {
    const fetchImpl = vi.fn(async () => reply(200, { success: true, data: { bookingId: "book-A" } }));
    await expect(callTrainerConsultationMethod({ descriptor: trainerStaffMethods[1], actor, resourceId: "book-A", accessToken: "synthetic-token", fetchImpl })).resolves.toEqual({ bookingId: "book-A" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/consultations/trainer/bookings/book-A/confirm");
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toMatchObject({ Authorization: "Bearer synthetic-token" });
  });
  it("never requests a foreign trainer target", async () => {
    const fn=vi.fn();
    await expect(callTrainerConsultationMethod({ descriptor: trainerStaffMethods[5], actor, targetTrainerId: "owner-B", accessToken: "token", fetchImpl: fn })).rejects.toThrow("ROLE_DENIED");
    expect(fn).not.toHaveBeenCalled();
  });
  it("denies server 403, preserves caller state, does not replay POST", async () => {
    const fetchImpl=vi.fn(async()=>reply(403,{success:false,error:"Недостаточно прав"}));
    await expect(callTrainerConsultationMethod({ descriptor: trainerStaffMethods[1], actor, resourceId:"book-A",accessToken:"token",fetchImpl })).rejects.toThrow("STAFF_HTTP_403");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("non-JSON 500 is ambiguous and not retried", async()=>{
    const fetchImpl=vi.fn(async()=>new Response("proxy error",{status:500,headers:{"cache-control":"private, no-store"}}));
    await expect(callTrainerConsultationMethod({ descriptor:trainerStaffMethods[4],actor,resourceId:"book-A",body:{reason:"test"},accessToken:"token",fetchImpl })).rejects.toThrow("UNCONFIRMED_RESPONSE");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("missing private no-store response is rejected",async()=>{
    const fetchImpl=vi.fn(async()=>reply(200,{success:true,data:{}},"public, max-age=3600"));
    await expect(callTrainerConsultationMethod({descriptor:trainerStaffMethods[7],actor,body:{date:"2026-11-08"},accessToken:"token",fetchImpl})).rejects.toThrow("UNSAFE_CACHE");
  });
});
