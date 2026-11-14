import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({lookup:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{consultationEmailLog:{findUnique:m.lookup}}}));
import {readConsultationBookingForMailLog} from "./consultationMailRead.js";

beforeEach(()=>{m.lookup.mockReset();m.lookup.mockResolvedValue(null)});
describe("consultation outbox mail read is minimal and single-log scoped",()=>{
  it("rejects an empty id before issuing any query",async()=>{
    expect(()=>readConsultationBookingForMailLog("")).toThrow("CONSULTATION_EMAIL_LOG_ID_REQUIRED");
    expect(m.lookup).not.toHaveBeenCalled();
  });
  it("selects exactly one log id, only the client and trainer contact, profile name and slot",async()=>{
    await expect(readConsultationBookingForMailLog("log-A")).resolves.toBeNull();
    expect(m.lookup).toHaveBeenCalledTimes(1);
    expect(m.lookup).toHaveBeenCalledWith({
      where:{id:"log-A"},
      include:{booking:{include:{
        client:{select:{email:true,username:true}},
        cynologist:{include:{user:{select:{email:true,username:true,profile:{select:{fullName:true}}}}}},
        slot:true,
      }}},
    });
    const query=JSON.stringify(m.lookup.mock.calls[0]?.[0]);
    for(const denied of ['password','session','resetToken','accessToken','apiKey','consentLog'])
      expect(query).not.toContain(denied);
  });
  it("does not replace database failures with success or suppress the transport retry",async()=>{
    const fault=new Error("fixture DB read failed");
    m.lookup.mockRejectedValueOnce(fault);
    await expect(readConsultationBookingForMailLog("log-A")).rejects.toBe(fault);
  });
});
