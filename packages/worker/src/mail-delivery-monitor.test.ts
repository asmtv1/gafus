import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  attemptQuery: vi.fn(),
  eventCount: vi.fn(),
  outboxCount: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    $queryRaw: mocks.attemptQuery,
    transactionalMailEvent: { count: mocks.eventCount },
    transactionalMailOutbox: { count: mocks.outboxCount },
  },
}));
vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => ({ warn: mocks.warn }),
}));

import {
  getMailDeliveryHealth,
  monitorMailDelivery,
  renderMailDeliveryMetricsPrometheus,
} from "./mail-delivery-monitor";

const zero = { stalledPending: 0, unresolvedUnknown: 0, expiredUnknown: 0, recentFailed: 0,
  resetAttemptEligible: 0, resetAttemptStalled: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.attemptQuery.mockResolvedValue([zero]);
  mocks.eventCount.mockResolvedValue(0);
  mocks.outboxCount.mockResolvedValue(0);
});

describe("mail delivery monitoring", () => {
  it("counts actionable attempts and delivery failures using safe time windows", async () => {
    const now = new Date("2026-10-14T13:40:00.000Z");
    mocks.attemptQuery.mockResolvedValueOnce([{ stalledPending: 2, unresolvedUnknown: 3,
      expiredUnknown: 1, recentFailed: 4, resetAttemptEligible: 9, resetAttemptStalled: 2 }]);
    mocks.eventCount.mockResolvedValueOnce(5);
    mocks.outboxCount.mockResolvedValueOnce(6).mockResolvedValueOnce(7).mockResolvedValueOnce(8).mockResolvedValueOnce(1);
    expect(await getMailDeliveryHealth(now)).toEqual({
      stalledPending: 2, unresolvedUnknown: 3, expiredUnknown: 1,
      recentFailed: 4, deliveryFailures24h: 5,
      queueFailed: 6, queueExpired: 7, queueStalled: 8,
      resetAttemptEligible: 9, resetAttemptStalled: 2, resetQueueStalled: 1,
    });
    expect(mocks.attemptQuery).toHaveBeenCalledOnce();
    const [parts, ...params] = mocks.attemptQuery.mock.calls[0];
    const sql = parts.join("?");
    expect(sql).toContain("status = 'PENDING' AND \"createdAt\" < ?");
    expect(sql).toContain("status = 'UNKNOWN' AND \"createdAt\" < ?");
    expect(sql).toContain("status = 'FAILED' AND \"createdAt\" >= ?");
    expect(sql).toContain("category = 'password_reset'");
    expect(sql).toContain('AS "resetAttemptEligible"');
    expect(sql).toContain('AS "resetAttemptStalled"');
    expect(params).toEqual([
      new Date("2026-10-14T13:35:00.000Z"), new Date("2026-10-14T13:35:00.000Z"),
      new Date("2026-10-13T14:40:00.000Z"), new Date("2026-10-13T13:40:00.000Z"),
      new Date("2026-10-14T12:40:00.000Z"), new Date("2026-10-14T13:35:00.000Z"),
      new Date("2026-10-14T12:40:00.000Z"), new Date("2026-10-14T13:35:00.000Z"),
      new Date("2026-10-14T13:35:00.000Z"), new Date("2026-10-13T13:40:00.000Z"),
      new Date("2026-10-14T12:40:00.000Z"), new Date("2026-10-14T13:35:00.000Z"),
    ]);
    expect(mocks.outboxCount.mock.calls[3][0].where).toMatchObject({
      category: "password_reset", expiresAt: { gt: now },
    });
    expect(mocks.eventCount.mock.calls[0][0].where.type.in).toContain("email.bounced");
  });

  it("warns with counts only when there is an actionable problem", async () => {
    await monitorMailDelivery();
    expect(mocks.warn).not.toHaveBeenCalled();
    mocks.attemptQuery.mockResolvedValue([zero]);
    mocks.eventCount.mockResolvedValue(2);
    await monitorMailDelivery();
    expect(mocks.warn).toHaveBeenCalledWith(
      "Transactional mail requires attention",
      expect.objectContaining({ deliveryFailures24h: 2 }),
    );
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("@");
  });

  it("exports Prometheus gauges for mail alerts", async () => {
    mocks.attemptQuery.mockResolvedValue([{ ...zero, unresolvedUnknown: 3, expiredUnknown: 3,
      resetAttemptEligible: 4, resetAttemptStalled: 1 }]);
    const metrics = await renderMailDeliveryMetricsPrometheus();
    expect(metrics).toContain("gafus_mail_unresolved_unknown 3");
    expect(metrics).toContain("gafus_mail_expired_unknown 3");
    expect(metrics).toContain("gafus_mail_delivery_failures_24h 0");
    expect(metrics).toContain("gafus_mail_queue_failed 0");
    expect(metrics).toContain("gafus_mail_reset_attempt_eligible_1h 4");
    expect(metrics).toContain("gafus_mail_reset_attempt_stalled_1h 1");
  });
});
