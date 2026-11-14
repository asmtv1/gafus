import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({actor:vi.fn(),subscription:vi.fn(),assignment:vi.fn(),grant:vi.fn(),write:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{
  user:{findUnique:m.actor,update:m.write},
  appSubscription:{findFirst:m.subscription},
  courseAccess:{findFirst:m.assignment},
  gafusTargetAccess:{findFirst:m.grant},
}}));
import {readAccessActorRole,hasCurrentPaidSubscription,hasAssignedPrivateCourse,hasActiveGafusArticleAccess,hasPaidChatDisplaySubscription} from "./policyReads.js";
const now=new Date("2026-11-07T12:00:00.000Z");
beforeEach(()=>{vi.clearAllMocks();m.actor.mockResolvedValue(null);m.subscription.mockResolvedValue(null);m.assignment.mockResolvedValue(null);m.grant.mockResolvedValue(null)});
describe("actor-scoped read-only entitlement projections",()=>{
  it("only resolves the current database role for exactly one owner",async()=>{
    m.actor.mockResolvedValue({role:"PARTNER"});
    expect(await readAccessActorRole("owner-A")).toBe("PARTNER");
    expect(m.actor).toHaveBeenCalledExactlyOnceWith({where:{id:"owner-A"},select:{role:true}});
  });
  it("enforces active subscription and valid lifetime or future period",async()=>{
    m.subscription.mockResolvedValue({id:"subscription"});
    expect(await hasCurrentPaidSubscription("owner-A",now)).toBe(true);
    expect(m.subscription).toHaveBeenCalledExactlyOnceWith({
      where:{userId:"owner-A",status:"ACTIVE",OR:[{isLifetime:true},{currentPeriodEnd:{gt:now}}]},
      select:{id:true},
    });
  });
  it("limits private course assignments to a single owner + course",async()=>{
    m.assignment.mockResolvedValue({courseId:"private"});
    expect(await hasAssignedPrivateCourse("owner-A","private")).toBe(true);
    expect(m.assignment).toHaveBeenCalledExactlyOnceWith({
      where:{userId:"owner-A",courseId:"private"},select:{courseId:true},
    });
  });
  it("requires matching article key + unexpired timestamp",async()=>{
    m.grant.mockResolvedValue({id:"grant"});
    expect(await hasActiveGafusArticleAccess("owner-A","article",now)).toBe(true);
    expect(m.grant).toHaveBeenCalledExactlyOnceWith({
      where:{userId:"owner-A",targetType:"ARTICLE",targetKey:"article:article",expiresAt:{gt:now}},
      select:{id:true},
    });
  });
  it("chat subscriber badge requires a successful positive payment",async()=>{
    m.subscription.mockResolvedValue({id:"paid"});
    expect(await hasPaidChatDisplaySubscription("owner-A",now)).toBe(true);
    expect(m.subscription).toHaveBeenCalledExactlyOnceWith({
      where:{userId:"owner-A",status:"ACTIVE",OR:[{isLifetime:true},{currentPeriodEnd:{gt:now}}],
        payments:{some:{status:"SUCCEEDED",amount:{gt:0}}}},select:{id:true},
    });
  });
  it("rejects missing actor and target identifiers without opening SQL",async()=>{
    expect(await readAccessActorRole("")).toBeNull();
    expect(await hasCurrentPaidSubscription("",now)).toBe(false);
    expect(await hasPaidChatDisplaySubscription("",now)).toBe(false);
    expect(await hasAssignedPrivateCourse("owner-A","")).toBe(false);
    expect(await hasActiveGafusArticleAccess("","article",now)).toBe(false);
    expect(m.actor).not.toHaveBeenCalled();
    expect(m.subscription).not.toHaveBeenCalled();
    expect(m.assignment).not.toHaveBeenCalled();
    expect(m.grant).not.toHaveBeenCalled();
    expect(m.write).not.toHaveBeenCalled();
  });
});
