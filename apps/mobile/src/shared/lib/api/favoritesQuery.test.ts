import {beforeEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({auth:{isAuthenticated:true,user:{id:"A"},verifiedSessionEpoch:"E1"},
  binding:{principalId:"A",authEpoch:"E1"},get:vi.fn()}));
vi.mock("./courses",()=>({coursesApi:{getFavorites:m.get}}));
vi.mock("@/shared/stores/authStore",()=>({useAuthStore:{getState:()=>m.auth}}));
vi.mock("@/shared/lib/offline/newOnlyV2Native",()=>({newOnlyV2NativeQueues:{getVerifiedBinding:()=>m.binding}}));
import {favoritesForActor} from "./favoritesQuery";
beforeEach(()=>{m.auth={isAuthenticated:true,user:{id:"A"},verifiedSessionEpoch:"E1"};
  m.binding={principalId:"A",authEpoch:"E1"};m.get.mockReset();});
describe("favorites private cache scope",()=>{
  it("isolates owner and same-owner session keys",()=>{
    const a=favoritesForActor({ownerId:"A",authEpoch:"E1"});
    expect(a.queryKey).toEqual(["favorites","A","E1"]);
    expect(a.queryKey).not.toEqual(favoritesForActor({ownerId:"A",authEpoch:"E2"}).queryKey);
    expect(a.queryKey).not.toEqual(favoritesForActor({ownerId:"B",authEpoch:"E1"}).queryKey);
  });
  it("does not read for a stale or unverified owner",async()=>{
    await expect(favoritesForActor({ownerId:"B",authEpoch:"E1"}).queryFn()).rejects.toThrow("FAVORITES_SESSION_CHANGED");
    expect(m.get).not.toHaveBeenCalled();
  });
  it("discards an in-flight result after the same owner reauthenticates",async()=>{
    m.get.mockImplementation(async()=>{m.auth.verifiedSessionEpoch="E2";m.binding.authEpoch="E2";return {success:true,data:{favoriteIds:["private"]}};});
    await expect(favoritesForActor({ownerId:"A",authEpoch:"E1"}).queryFn()).rejects.toThrow("FAVORITES_SESSION_CHANGED");
  });
  it("returns current verified session's data",async()=>{
    m.get.mockResolvedValue({success:true,data:{favoriteIds:["safe"]}});
    await expect(favoritesForActor({ownerId:"A",authEpoch:"E1"}).queryFn()).resolves.toMatchObject({data:{favoriteIds:["safe"]}});
  });
});
