import { describe, expect, it, vi } from "vitest";
const sql=vi.hoisted(()=>({
  owner:vi.fn(async(_id:string)=>({id:"owner-1"})),
  profile:vi.fn(async(_id:string)=>({id:"owner-1",username:"test",phone:null,email:null,
    role:"USER",passwordSetAt:null,onboardingTourCompletedAt:null,accounts:[],profile:null})),
}));
vi.mock("@gafus/identity-write-server/profile-rows",()=>({
  readUserProfileRow:vi.fn(async()=>null),
  upsertProfileFields:vi.fn(async()=>({id:"p-1"})),
  readProfileActorExists:sql.owner,
  readUserIdByUsernameRow:vi.fn(async()=>null),
  readPublicProfileRow:vi.fn(async()=>null),
  replaceProfileAvatarRow:vi.fn(async()=>null),
  readUserWithTrainingsRow:vi.fn(async()=>null),
  readUserProfileForApiRow:sql.profile,
  readOnboardingTourStatusRow:vi.fn(async()=>null),
  markOnboardingTourSeenRow:vi.fn(async()=>({onboardingTourCompletedAt:new Date()})),
  readPaidChatDisplayEntitlement:vi.fn(async()=>false),
}));
describe("API profile owner SQL bootstrap and private/public projection",()=>{
  it("binds exact actor identity before Core UserProfile DTO and refuses replacement",async()=>{
    const core=await import("@gafus/core/services/user");
    await import("./install-profile-rows");
    await expect(core.existsUser("owner-1")).resolves.toBe(true);
    expect(sql.owner).toHaveBeenCalledExactlyOnceWith("owner-1");
    await expect(core.getUserProfileForApi("owner-1")).resolves.toMatchObject({
      id:"owner-1",role:"USER",hasVkLinked:false,hasAppPassword:false,profile:{birthDate:null},
    });
    expect(sql.profile).toHaveBeenCalledExactlyOnceWith("owner-1");
    expect(()=>core.registerProfileRowsPort({} as never)).toThrow("PROFILE_ROWS_PORT_ALREADY_BOUND");
  });
});
