/** Actual approved read-only subscription snapshot used by Achievements. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({user:vi.fn(),subs:vi.fn(),payments:vi.fn(),writes:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{
  user:{findUnique:m.user},appSubscription:{findMany:m.subs},
  appSubscriptionPayment:{findFirst:m.payments},$transaction:m.writes,
}}));
import { getAppSubscriptionAccess } from "./accessService";
const now=new Date("2026-10-18T06:00:00Z");
const subscription=(overrides:Record<string,unknown>={})=>({
  id:"synthetic-sub",userId:"owner-A",status:"ACTIVE",isLifetime:false,
  provider:"APPLE",planCode:"MONTHLY",currentPeriodEnd:new Date("2026-11-18T00:00:00Z"),
  createdAt:new Date("2026-10-01T00:00:00Z"),
  cancelAtPeriodEnd:false,yookassaPaymentMethodId:null,yookassaPaymentMethodLast4:null,
  yookassaPaymentMethodTitle:null,payments:[],...overrides,
});
let rows:ReturnType<typeof subscription>[]=[];
beforeEach(()=>{
  vi.clearAllMocks();rows=[];m.user.mockResolvedValue({role:"USER"});
  m.subs.mockImplementation(async({where}:{where:{status:unknown}})=>
    where.status==="ACTIVE"?rows.filter(r=>r.status==="ACTIVE"):
      rows.filter(r=>["ACTIVE","PENDING","PAST_DUE"].includes(r.status)));
  m.payments.mockResolvedValue(null);
});
describe("Core Achievements entitlement snapshot read-only, no reconcile/payment provider",()=>{
  it("S01 missing subscription -> false, owner-only SELECT",async()=>{
    const result=await getAppSubscriptionAccess("owner-A",now);
    expect(result.hasActiveSubscription).toBe(false);
    expect(m.user).toHaveBeenCalledWith({where:{id:"owner-A"},select:{role:true}});
    expect(m.subs.mock.calls.every(call=>call[0].where.userId==="owner-A")).toBe(true);
    expect(m.writes).not.toHaveBeenCalled();
  });
  it.each(["PENDING","PAST_DUE"])("S02 %s cannot confer entitlement",async status=>{
    rows=[subscription({status})];
    const result=await getAppSubscriptionAccess("owner-A",now);
    expect(result.hasActiveSubscription).toBe(false);
    expect(result.status).toBe(status);
    expect(m.payments).not.toHaveBeenCalled();
    expect(m.writes).not.toHaveBeenCalled();
  });
  it("S03 expired ACTIVE currentPeriodEnd denies",async()=>{
    rows=[subscription({currentPeriodEnd:new Date("2026-10-17T00:00:00Z")})];
    expect((await getAppSubscriptionAccess("owner-A",now)).hasActiveSubscription).toBe(false);
    expect(m.writes).not.toHaveBeenCalled();
  });
  it("S04 active APPLE monthly allows read without provider refresh",async()=>{
    rows=[subscription()];
    const result=await getAppSubscriptionAccess("owner-A",now);
    expect(result.hasActiveSubscription).toBe(true);
    expect(result.provider).toBe("APPLE");
    expect(m.payments).toHaveBeenCalledTimes(1);
    expect(m.writes).not.toHaveBeenCalled();
  });
  it("S05 lifetime ACTIVE allows with no period end",async()=>{
    rows=[subscription({isLifetime:true,currentPeriodEnd:null,provider:"MANUAL"})];
    const result=await getAppSubscriptionAccess("owner-A",now);
    expect(result.hasActiveSubscription).toBe(true);
    expect(result.isLifetime).toBe(true);
    expect(m.writes).not.toHaveBeenCalled();
  });
  it("S06 PARTNER current DB role bypass, never JWT role",async()=>{
    m.user.mockResolvedValue({role:"PARTNER"});
    const result=await getAppSubscriptionAccess("owner-A",now);
    expect(result.hasActiveSubscription).toBe(true);
    expect(result.isLifetime).toBe(true);
    expect(m.writes).not.toHaveBeenCalled();
  });
});
