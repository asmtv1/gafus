/** AG1 G14 real Vox Core access and TTL with mocked Prisma, ZERO provider calls. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({ find:vi.fn() }));
vi.mock("@gafus/prisma",()=>({
  prisma:{consultationBooking:{findUnique:m.find}},
  ConsultationBookingStatus:{CONFIRMED:"CONFIRMED",PENDING_TRAINER_CONFIRMATION:"PENDING_TRAINER_CONFIRMATION"},
}));
import {
  createConsultationCallAdmission,isConsultationCallTimeAllowed,
  prepareConsultationCall,signConsultationOneTimeKey,
} from "./voximplantService";
const fixture=()=>({
  clientId:"client-A",status:"CONFIRMED",slot:{startAt:new Date(Date.now()+10*60_000),endAt:new Date(Date.now()+70*60_000)},
  cynologist:{userId:"trainer-A"},
});
const blankVox={
  VOXIMPLANT_APPLICATION_ID:"1",VOXIMPLANT_ACCOUNT_ID:"1",VOXIMPLANT_ACCOUNT_NAME:"testacct",
  VOXIMPLANT_APPLICATION_NAME:"testapp",VOXIMPLANT_KEY_ID:"fixture",VOXIMPLANT_PRIVATE_KEY:"DUMMY_NOT_REAL_KEY",
  VOXIMPLANT_CREDENTIAL_SECRET:"test-only-credential-secret-32-characters-minimum",
  VOXIMPLANT_ADMISSION_SECRET:"test-only-admission-secret-32-characters-minimum",
};
beforeEach(()=>{vi.clearAllMocks();m.find.mockResolvedValue(fixture());});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.useRealTimers();});
describe("AG1 G14 real Core owner/time/admission policy, no external Vox",()=>{
  it("unknown booking cannot create admission (404 before provider config)",async()=>{
    m.find.mockResolvedValueOnce(null);
    await expect(createConsultationCallAdmission("missing","client-A"))
      .rejects.toMatchObject({code:"CONSULTATION_NOT_FOUND",statusCode:404});
  });
  it("foreign actor denied admission (403 before provider config)",async()=>{
    await expect(createConsultationCallAdmission("booking-A","attacker-B"))
      .rejects.toMatchObject({code:"CONSULTATION_FORBIDDEN",statusCode:403});
  });
  it("pending booking denied sign (403)",async()=>{
    m.find.mockResolvedValueOnce({...fixture(),status:"PENDING_TRAINER_CONFIRMATION"});
    await expect(signConsultationOneTimeKey("booking-A","client-A","valid-key-123"))
      .rejects.toMatchObject({code:"CONSULTATION_FORBIDDEN",statusCode:403});
  });
  it("no-show actor outside 15-minute early window cannot prepare",async()=>{
    m.find.mockResolvedValueOnce({
      ...fixture(),
      slot: {
        startAt: new Date(Date.now()+16*60_000),
        endAt: new Date(Date.now()+90*60_000),
      },
    });
    await expect(prepareConsultationCall("booking-A","client-A"))
      .rejects.toMatchObject({code:"CONSULTATION_FORBIDDEN",statusCode:403});
  });
  it("after finish plus 60-minute grace denies new admission",async()=>{
    m.find.mockResolvedValueOnce({
      ...fixture(),
      slot: {
        startAt: new Date(Date.now()-130*60_000),
        endAt: new Date(Date.now()-61*60_000),
      },
    });
    await expect(createConsultationCallAdmission("booking-A","client-A"))
      .rejects.toMatchObject({code:"CONSULTATION_FORBIDDEN",statusCode:403});
  });
  it("time admission allowed from start-15m through end+60m inclusive",()=>{
    const start=new Date("2026-11-01T12:00:00.000Z"),end=new Date("2026-11-01T13:00:00.000Z");
    expect(isConsultationCallTimeAllowed(start,end,new Date("2026-11-01T11:44:59.999Z"))).toBe(false);
    expect(isConsultationCallTimeAllowed(start,end,new Date("2026-11-01T11:45:00.000Z"))).toBe(true);
    expect(isConsultationCallTimeAllowed(start,end,new Date("2026-11-01T14:00:00.000Z"))).toBe(true);
    expect(isConsultationCallTimeAllowed(start,end,new Date("2026-11-01T14:00:00.001Z"))).toBe(false);
  });
  it("admission TTL is 90 seconds and sign does not fetch provider",async()=>{
    for(const [name,value] of Object.entries(blankVox))vi.stubEnv(name,value);
    const fakeFetch=vi.fn(()=>{throw Error("No provider traffic allowed in Core test");});
    vi.stubGlobal("fetch",fakeFetch);
    const now=Math.floor(Date.now()/1000);
    const data=await createConsultationCallAdmission("booking-A","client-A");
    expect(data.expires).toBeGreaterThanOrEqual(now+90);
    expect(data.expires).toBeLessThanOrEqual(now+91);
    expect(data.admission).toMatch(/^\d+\.[0-9a-f]{64}$/);
    const token=await signConsultationOneTimeKey("booking-A","client-A","valid-key-123");
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(fakeFetch).not.toHaveBeenCalled();
    expect(m.find).toHaveBeenCalledTimes(2);
  });
  it("invalid challenge denied before booking read",async()=>{
    await expect(signConsultationOneTimeKey("booking-A","client-A","short"))
      .rejects.toMatchObject({code:"CONSULTATION_FORBIDDEN",statusCode:403});
    expect(m.find).not.toHaveBeenCalled();
  });
});
