import { beforeEach, describe, expect, it, vi } from "vitest";
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
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
  it("passes profile reader instances explicitly, with no registration on cold import", async () => {
    const core = await import("@gafus/core/services/user");
    const { profileRows } = await import("./profile-rows-instance.js");
    await expect(core.existsUser("owner-1", profileRows)).resolves.toBe(true);
    expect(sql.owner).toHaveBeenCalledExactlyOnceWith("owner-1");
    const original = await core.getUserProfileForApi("owner-1", profileRows);
    expect(original?.username).toBe("test");
    const first = { ...profileRows, readUserProfileForApiRow: async () => ({
      id: "owner-1", username: "actor-a", phone: null, email: null,
      role: "USER", passwordSetAt: null, onboardingTourCompletedAt: null,
      accounts: [], profile: null,
    }) };
    const second = { ...profileRows, readUserProfileForApiRow: async () => ({
      id: "owner-1", username: "actor-b", phone: null, email: null,
      role: "USER", passwordSetAt: null, onboardingTourCompletedAt: null,
      accounts: [], profile: null,
    }) };
    await expect(core.getUserProfileForApi("owner-1", first)).resolves.toMatchObject({username:"actor-a"});
    await expect(core.getUserProfileForApi("owner-1", second)).resolves.toMatchObject({username:"actor-b"});
    await expect(core.existsUser("owner-1")).rejects.toThrow("PROFILE_ROWS_PORT_UNBOUND");
    await expect(core.getUserProfileForApi("owner-1")).rejects.toThrow("PROFILE_ROWS_PORT_UNBOUND");
  });
  it("binds exact actor identity before Core UserProfile DTO and refuses replacement",async()=>{
    const core=await import("@gafus/core/services/user");
    await import("./install-profile-rows");
    await expect(core.existsUser("owner-1")).resolves.toBe(true);
    expect(sql.owner).toHaveBeenCalledExactlyOnceWith("owner-1");
    await expect(core.getUserProfileForApi("owner-1")).resolves.toMatchObject({
      id:"owner-1",role:"USER",hasAppPassword:false,profile:{birthDate:null},
    });
    expect((await core.getUserProfileForApi("owner-1"))).not.toHaveProperty("hasVkLinked");
    expect(sql.profile).toHaveBeenCalledTimes(2);
    expect(sql.profile).toHaveBeenLastCalledWith("owner-1");
    expect(()=>core.registerProfileRowsPort({} as never)).toThrow("PROFILE_ROWS_PORT_ALREADY_BOUND");
  });
});
