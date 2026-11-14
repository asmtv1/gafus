import { describe, expect, it, vi } from "vitest";
const sql=vi.hoisted(()=>({
  role:vi.fn(async(_owner:string)=>({role:"USER"})),
  grant:vi.fn(async(_owner:string,_type:string,_id:string)=>null),
}));
vi.mock("@gafus/entitlements-server/rewarded-access-reads",()=>({
  readOwnedCourseDayRewardedSteps:vi.fn(),
  readOwnedRewardedUserStep:vi.fn(),
  readRewardedPrivateCourseAssignment:vi.fn(),
  readOwnedDailyRewardedUserStep:vi.fn(),
  readPublishedDailyRewardedVideo:vi.fn(),
  readOwnedRewardedVideoStep:vi.fn(),
  readActiveLegacyRewardedGrant:sql.grant,
  readRewardedViewerRole:sql.role,
  readRewardedCourseVideoOccurrences:vi.fn(async()=>[]),
  readPendingRewardedStepNotificationUrl:vi.fn(),
}));
describe("API rewarded course/video SQL read composition",()=>{
  it("passes owner and exact target to SQL without invented authorization",async()=>{
    const core=await import("@gafus/core/services/rewardedCredits");
    await import("./install-access-reads");
    await expect(core.hasRewardedTargetUnlock({
      userId:"owner-1",platform:"ANDROID",target:{targetType:"ARTICLE",targetId:"article-2"},
    })).resolves.toBe(false);
    expect(sql.grant).toHaveBeenCalledWith("owner-1","ARTICLE","article-2",expect.any(Date));
    expect(()=>core.registerRewardedAccessReadPort({} as never))
      .toThrow("REWARDED_ACCESS_READ_PORT_ALREADY_BOUND");
  });
});
