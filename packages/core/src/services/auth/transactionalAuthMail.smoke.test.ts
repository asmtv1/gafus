import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ send: vi.fn(), enabled: vi.fn(() => true) }));
vi.mock("@gafus/mailer", () => ({ isMailerConfigured: () => true, mailOutboxEnabled: mock.enabled, mailerEnvFromProcess: () => ({ provider: "resend" }) }));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: vi.fn(), warn: vi.fn() }) }));
vi.mock("../mail/publicWebBaseUrl", () => ({ getPublicWebBaseUrl: () => "https://gafus.ru" }));
vi.mock("../mail/transactionalEmailLayout", () => ({
  sendTransactionalEmailWithLayout: mock.send,
  ctaButtonHtml: (url: string, label: string) => label + url,
  plainLinkFallbackHtml: (url: string) => url,
  paragraphHtml: (text: string) => text,
  escapeHtml: (text: string) => text,
}));
import {
  sendPasswordResetLinkEmail, sendEmailChangeConfirmEmail, sendAccountDeletionCodeEmail,
  sendWelcomeEmailAfterRegistration, sendPasswordChangedNoticeEmail, sendUsernameChangedNoticeEmail,
} from "./transactionalAuthMail";

beforeEach(() => { vi.clearAllMocks(); mock.send.mockResolvedValue(undefined); mock.enabled.mockReturnValue(true); });
describe("transactional auth mail policies", () => {
  it("queues reset with a bounded TTL, but keeps confirmation and deletion immediate", async () => {
    await expect(sendPasswordResetLinkEmail("test@example.test", "https://example.test/reset")).resolves.toBe("queued");
    await sendEmailChangeConfirmEmail("test@example.test", "https://example.test/confirm");
    await sendAccountDeletionCodeEmail("test@example.test", "000000");
    expect(mock.send).toHaveBeenCalledTimes(3);
    expect(mock.send.mock.calls[0][0]).toMatchObject({ deliveryMode: "deferred", category: "auth", maxQueueAgeMs: 2_700_000 });
    for (const [payload] of mock.send.mock.calls.slice(1)) {
      expect(payload).toMatchObject({ deliveryMode: "immediate", category: "auth" });
    }
  });
  it("keeps direct reset delivery when the outbox is disabled", async () => {
    mock.enabled.mockReturnValue(false);
    await expect(sendPasswordResetLinkEmail("test@example.test", "https://example.test/reset")).resolves.toBe("sent");
    expect(mock.send.mock.calls[0][0]).toMatchObject({ deliveryMode: "immediate" });
  });
  it("queues welcome and change notices only for a bounded period", async () => {
    await sendWelcomeEmailAfterRegistration("test@example.test");
    await sendPasswordChangedNoticeEmail("test@example.test");
    await sendUsernameChangedNoticeEmail("test@example.test", "newLogin");
    expect(mock.send).toHaveBeenCalledTimes(3);
    expect(mock.send.mock.calls[0][0]).toMatchObject({ category: "welcome", maxQueueAgeMs: 43_200_000 });
    for (const [payload] of mock.send.mock.calls.slice(1)) {
      expect(payload).toMatchObject({ category: "notice", maxQueueAgeMs: 3_600_000 });
    }
  });
});
