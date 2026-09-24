import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(), queryRawUnsafe: vi.fn(), update: vi.fn(), settings: vi.fn(), mail: vi.fn(), push: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: {
  appSubscriptionSettings: { findUnique: mocks.settings },
  appSubscription: { findMany: mocks.findMany, update: mocks.update },
  $queryRawUnsafe: mocks.queryRawUnsafe,
} }));
vi.mock("@gafus/mailer", () => ({ sendTransactionalMail: mocks.mail }));
vi.mock("@gafus/webpush", () => ({ sendImmediatePushNotification: mocks.push }));
vi.mock("@gafus/logger", () => ({ createWorkerLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

import { sendYookassaAppSubscriptionRenewalReminders } from "./app-subscription-renewal-reminders";

const periodEnd = new Date("2026-09-09T12:00:00Z");
const row = { id: "sub-1", userId: "user-1", planCode: "MONTHLY", currentPeriodEnd: periodEnd, user: { email: "user@example.test" } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
  mocks.settings.mockResolvedValue({ yookassaMonthlyPriceRub: 2500 });
  mocks.queryRawUnsafe.mockResolvedValue([{ id: row.id }]);
  mocks.findMany.mockResolvedValue([]);
  mocks.mail.mockResolvedValue(undefined);
  mocks.push.mockResolvedValue(undefined);
  mocks.update.mockResolvedValue({});
});
afterEach(() => vi.useRealTimers());

describe("subscription renewal reminders", () => {
  it("emails three days before renewal with full price, Moscow date and management link, without push", async () => {
    mocks.findMany.mockResolvedValueOnce([row]);
    expect(await sendYookassaAppSubscriptionRenewalReminders()).toEqual({ sent: 1, skipped: 0, errors: 0 });
    expect(mocks.mail).toHaveBeenCalledWith(expect.objectContaining({
      to: "user@example.test",
      text: expect.stringContaining("2500 ₽"),
      html: expect.stringContaining('href="https://gafus.ru/profile"'),
    }));
    expect(mocks.mail.mock.calls[0][0].text).toContain("09.09.2026, 15:00 МСК");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: row.id }, data: { renewalEmailThreeDaysSentForPeriodEnd: periodEnd } });
  });

  it("filters eligible upcoming auto renewals and excludes sent periods before applying batch limit", async () => {
    await sendYookassaAppSubscriptionRenewalReminders({ batchSize: 10 });
    expect(mocks.queryRawUnsafe.mock.calls[0][0]).toContain('"renewalEmailThreeDaysSentForPeriodEnd" IS DISTINCT FROM subscription."currentPeriodEnd"');
    expect(mocks.queryRawUnsafe.mock.calls[0].slice(1)).toEqual([
      new Date("2026-09-06T14:00:00Z"), periodEnd, 10,
    ]);
    expect(mocks.findMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: [row.id] } } });
  });

  it("does not resend the same period, but sends for a new period", async () => {
    mocks.findMany.mockResolvedValueOnce([{ ...row, renewalEmailThreeDaysSentForPeriodEnd: periodEnd }]);
    expect(await sendYookassaAppSubscriptionRenewalReminders()).toMatchObject({ skipped: 1, sent: 0 });
    expect(mocks.mail).not.toHaveBeenCalled();
    mocks.findMany.mockResolvedValueOnce([{ ...row, renewalEmailThreeDaysSentForPeriodEnd: new Date("2026-08-10") }]);
    expect(await sendYookassaAppSubscriptionRenewalReminders()).toMatchObject({ sent: 1 });
  });

  it("keeps failures retryable and continues to other recipients", async () => {
    mocks.findMany.mockResolvedValueOnce([row, { ...row, id: "sub-2" }]);
    mocks.mail.mockRejectedValueOnce(new Error("SMTP unavailable"));
    expect(await sendYookassaAppSubscriptionRenewalReminders()).toEqual({ sent: 1, errors: 1, skipped: 0 });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0][0].where.id).toBe("sub-2");
  });

  it("skips missing emails and unknown plans", async () => {
    mocks.findMany.mockResolvedValueOnce([{ ...row, user: { email: null } }, { ...row, planCode: "UNKNOWN" }]);
    expect(await sendYookassaAppSubscriptionRenewalReminders()).toMatchObject({ skipped: 2, sent: 0 });
    expect(mocks.mail).not.toHaveBeenCalled();
  });

  it("preserves the two hour email and push independently of the early email marker", async () => {
    mocks.queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: row.id }]);
    mocks.findMany.mockResolvedValueOnce([{ ...row, renewalEmailThreeDaysSentForPeriodEnd: periodEnd }]);
    expect(await sendYookassaAppSubscriptionRenewalReminders()).toMatchObject({ sent: 1 });
    expect(mocks.mail.mock.calls[0][0].text).toContain("Через 2 часа");
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0][0].data).toEqual({ renewalReminderSentForPeriodEnd: periodEnd });
  });
});
