import {beforeEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({query:vi.fn(),outboxCount:vi.fn(),eventCount:vi.fn(),warn:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{
  $queryRaw:m.query,
  transactionalMailOutbox:{count:m.outboxCount},transactionalMailEvent:{count:m.eventCount},
}}));
vi.mock("@gafus/logger",()=>({createWorkerLogger:()=>({warn:m.warn})}));
import {getMailDeliveryHealth,monitorMailDelivery,renderMailDeliveryMetricsPrometheus} from "./mailDeliveryMonitor";
beforeEach(()=>{
  vi.clearAllMocks();
  m.query.mockResolvedValue([{stalledPending:0,unresolvedUnknown:0,expiredUnknown:0,recentFailed:0,resetAttemptEligible:0,resetAttemptStalled:0}]);
  m.outboxCount.mockResolvedValue(0);m.eventCount.mockResolvedValue(0);
});
describe("password reset operational signals",()=>{
  it("same statement defines the denominator and stuck numerator",async()=>{
    const now=new Date("2026-11-27T12:00:00Z");
    m.query.mockResolvedValue([{stalledPending:1,unresolvedUnknown:2,expiredUnknown:0,recentFailed:0,resetAttemptEligible:13,resetAttemptStalled:3}]);
    m.outboxCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    const result=await getMailDeliveryHealth(now);
    expect(result).toMatchObject({resetAttemptEligible:13,resetAttemptStalled:3,resetQueueStalled:1});
    expect(m.query).toHaveBeenCalledTimes(1);
    const [parts,...parameters]=m.query.mock.calls[0]!;
    const statement=parts.join("?");
    expect(statement).toContain('FROM "TransactionalMailAttempt"');
    expect(statement).toContain('AS "resetAttemptEligible"');
    expect(statement).toContain('AS "resetAttemptStalled"');
    expect(parameters).toContainEqual(new Date("2026-11-27T11:00:00Z"));
    expect(parameters).toContainEqual(new Date("2026-11-27T11:55:00Z"));
    expect(parameters).toContainEqual(new Date("2026-11-26T13:00:00Z"));
    expect(parameters).toContainEqual(new Date("2026-11-26T12:00:00Z"));
    expect(m.outboxCount).toHaveBeenLastCalledWith({where:{category:"password_reset",expiresAt:{gt:now},OR:[
      {status:"PENDING",createdAt:{lt:new Date("2026-11-27T11:55:00Z")},nextAttemptAt:{lte:now}},
      {status:"PROCESSING",leaseExpiresAt:{lt:now}},
    ]}});
  });
  it("no traffic exports zero, accepted traffic alone is not a warning",async()=>{
    expect(await renderMailDeliveryMetricsPrometheus()).toContain("gafus_mail_reset_attempt_eligible_1h 0");
    m.query.mockResolvedValue([{stalledPending:0,unresolvedUnknown:0,expiredUnknown:0,recentFailed:0,resetAttemptEligible:3,resetAttemptStalled:0}]);
    await monitorMailDelivery();expect(m.warn).not.toHaveBeenCalled();
  });
  it("missing aggregate row is unavailable",async()=>{
    m.query.mockResolvedValueOnce([]);
    await expect(renderMailDeliveryMetricsPrometheus()).rejects.toThrow("MAIL_ATTEMPT_METRICS_MISSING");
  });
  it("DB failure propagates and cannot become a zero-valued healthy snapshot",async()=>{
    m.query.mockRejectedValueOnce(Error("database unavailable"));
    await expect(renderMailDeliveryMetricsPrometheus()).rejects.toThrow("database unavailable");
  });
});
