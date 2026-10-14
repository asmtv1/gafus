import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  attemptCount: vi.fn(),
  eventCount: vi.fn(),
  outboxCount: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    transactionalMailAttempt: { count: mocks.attemptCount },
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.attemptCount.mockResolvedValue(0);
  mocks.eventCount.mockResolvedValue(0);
  mocks.outboxCount.mockResolvedValue(0);
});

describe("mail delivery monitoring", () => {
  it("counts actionable attempts and delivery failures using safe time windows", async () => {
    const now = new Date("2026-10-14T13:40:00.000Z");
    mocks.attemptCount.mockResolvedValueOnce(2).mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1).mockResolvedValueOnce(4);
    mocks.eventCount.mockResolvedValueOnce(5);
    mocks.outboxCount.mockResolvedValueOnce(6).mockResolvedValueOnce(7).mockResolvedValueOnce(8);
    expect(await getMailDeliveryHealth(now)).toEqual({
      stalledPending: 2, unresolvedUnknown: 3, expiredUnknown: 1,
      recentFailed: 4, deliveryFailures24h: 5,
      queueFailed: 6, queueExpired: 7, queueStalled: 8,
    });
    const where = mocks.attemptCount.mock.calls.map(([arg]) => arg.where);
    expect(where[0]).toEqual({ status: "PENDING", createdAt: { lt: new Date("2026-10-14T13:35:00.000Z") } });
    expect(where[1]).toEqual({ status: "UNKNOWN", createdAt: { lt: new Date("2026-10-14T13:35:00.000Z") } });
    expect(where[2]).toEqual({ status: "UNKNOWN", createdAt: { lt: new Date("2026-10-13T14:40:00.000Z") } });
    expect(where[3]).toEqual({ status: "FAILED", createdAt: { gte: new Date("2026-10-13T13:40:00.000Z") } });
    expect(mocks.eventCount.mock.calls[0][0].where.type.in).toContain("email.bounced");
  });

  it("warns with counts only when there is an actionable problem", async () => {
    await monitorMailDelivery();
    expect(mocks.warn).not.toHaveBeenCalled();
    mocks.attemptCount.mockResolvedValue(0);
    mocks.eventCount.mockResolvedValue(2);
    await monitorMailDelivery();
    expect(mocks.warn).toHaveBeenCalledWith(
      "Transactional mail requires attention",
      expect.objectContaining({ deliveryFailures24h: 2 }),
    );
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("@");
  });

  it("exports Prometheus gauges for mail alerts", async () => {
    mocks.attemptCount.mockResolvedValue(3);
    const metrics = await renderMailDeliveryMetricsPrometheus();
    expect(metrics).toContain("gafus_mail_unresolved_unknown 3");
    expect(metrics).toContain("gafus_mail_expired_unknown 3");
    expect(metrics).toContain("gafus_mail_delivery_failures_24h 0");
    expect(metrics).toContain("gafus_mail_queue_failed 0");
  });
});
