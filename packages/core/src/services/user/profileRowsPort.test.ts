import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileRowsPort } from "./profileRowsPort";
const flags=vi.hoisted(()=>({signed:vi.fn(async(s:string)=>s)}));
vi.mock("@gafus/cdn-upload",()=>({getSignedDownloadUrl:flags.signed}));
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({info:vi.fn(),warn:vi.fn(),error:vi.fn()})}));
function stub():ProfileRowsPort {
  return {
    readUserProfileRow:vi.fn(async()=>null),
    upsertProfileFields:vi.fn(async()=>({} as never)),
    readProfileActorExists:vi.fn(async()=>null),
    readUserIdByUsernameRow:vi.fn(async()=>null),
    readPublicProfileRow:vi.fn(async()=>null),
    replaceProfileAvatarRow:vi.fn(async()=>null),
    readUserWithTrainingsRow:vi.fn(async()=>null),
    readUserProfileForApiRow:vi.fn(async()=>null),
    readOnboardingTourStatusRow:vi.fn(async()=>null),
    markOnboardingTourSeenRow:vi.fn(async()=>({onboardingTourCompletedAt:new Date()})),
    readPaidChatDisplayEntitlement:vi.fn(async()=>false),
  };
}
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();});
describe("owner-scoped user profile SQL read/write port",()=>{
  it("fails closed on profile reads and actor resolution without SQL startup",async()=>{
    const svc=await import("./profileService");
    await expect(svc.getUserProfileForApi("owner-a")).rejects.toThrow("PROFILE_ROWS_PORT_UNBOUND");
    await expect(svc.getPublicProfile("username-a")).rejects.toThrow("PROFILE_ROWS_PORT_UNBOUND");
    await expect(svc.getUserIdByUsername("username-a")).rejects.toThrow("PROFILE_ROWS_PORT_UNBOUND");
    await expect(svc.getOnboardingTourStatus("owner-a")).rejects.toThrow("PROFILE_ROWS_PORT_UNBOUND");
  });
  it("never exposes passwords/account provider rows or private DB fields in API DTO",async()=>{
    const port=await import("./profileRowsPort");const svc=await import("./profileService");
    const db=stub();db.readUserProfileForApiRow=vi.fn(async()=>({
      id:"owner-A",username:"dog-owner",role:"USER",phone:null,email:"owner@example.test",
      passwordSetAt:new Date("2026-05-11T00:00:00.000Z"),
      onboardingTourCompletedAt:new Date("2026-11-01T09:30:00.000Z"),accounts:[{id:"vk-1"}],
      profile:{fullName:"Public",city:"Самара",birthDate:new Date("2000-02-29T00:00:00.000Z"),
        about:null,telegram:null,instagram:null,website:null,avatarUrl:null},
    }));const fixtureProfileRowsPort = db;
    const result=await svc.getUserProfileForApi("owner-A", fixtureProfileRowsPort);
    expect(db.readUserProfileForApiRow).toHaveBeenCalledExactlyOnceWith("owner-A");
    expect(result).toMatchObject({id:"owner-A",hasAppPassword:true,
      onboardingTourCompletedAt:"2026-11-01T09:30:00.000Z",
      profile:{city:"Самара",birthDate:"2000-02-29"}});
    expect(result).not.toHaveProperty("accounts");
    expect(result).not.toHaveProperty("hasVkLinked");
    expect(result).not.toHaveProperty("passwordSetAt");
    expect(result).not.toHaveProperty("profile.cityKey");
  });
  it("uses exact actor and never grants public chat subscriber role from token",async()=>{
    const port=await import("./profileRowsPort");const svc=await import("./profileService");
    const db=stub();db.readPublicProfileRow=vi.fn(async()=>({
      id:"owner-A",username:"owner",role:"USER" as const,profile:null,diplomas:[],pets:[],authoredCourses:[],
    }));const fixtureProfileRowsPort = db;
    await expect(svc.getPublicProfile("owner", fixtureProfileRowsPort)).resolves.toMatchObject({username:"owner",role:"USER",chatRole:null});
    expect(db.readPublicProfileRow).toHaveBeenCalledExactlyOnceWith("owner");
    expect(db.readPaidChatDisplayEntitlement).toHaveBeenCalledWith("owner-A",expect.any(Date));
  });

});
