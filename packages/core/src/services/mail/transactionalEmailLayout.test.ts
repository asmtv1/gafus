import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  send: vi.fn(),
  sendWithDisposition: vi.fn(),
  provider: vi.fn<() => "resend" | "smtp">(),
  readFile: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ readFile: mock.readFile }));
vi.mock("@gafus/mailer", () => ({
  mailerEnvFromProcess: () => ({ provider: mock.provider() }),
  isMailerConfigured: () => true,
  mailOutboxEnabled: () => true,
  sendTransactionalMail: mock.send,
  sendTransactionalMailWithDisposition: mock.sendWithDisposition,
}));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ warn: vi.fn() }) }));

import { sendPasswordResetLinkEmail, sendWelcomeEmailAfterRegistration } from "../auth/transactionalAuthMail";
import {
  ctaButtonHtml,
  sendTransactionalEmailWithLayout,
  sendTransactionalEmailWithLayoutDisposition,
} from "./transactionalEmailLayout";

const link = "https://gafus.ru/reset-password?token=synthetic-test-only";
const input = {
  to: "recipient@example.test",
  subject: "Восстановление пароля",
  text: link,
  blocksHtml: [ctaButtonHtml(link, "Сбросить пароль")],
  category: "auth" as const,
};

describe("transactional email logo transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WEB_APP_URL", "https://gafus.ru");
    vi.stubEnv("TRANSACTIONAL_EMAIL_LOGO_PATH", "/test/logo.png");
    mock.readFile.mockResolvedValue(Buffer.alloc(242472));
    mock.provider.mockReturnValue("resend");
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("keeps Resend payload compact without fetching or attaching the logo", async () => {
    await sendTransactionalEmailWithLayout(input);
    const payload = mock.send.mock.calls[0][0];
    expect(payload.attachments).toBeUndefined();
    expect(payload.html).toContain("https://gafus.ru/uploads/logo.png");
    expect(payload.html).not.toContain("cid:");
    expect(payload.html).toContain(link);
    expect(payload.text).toBe(link);
    expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(12_000);
    expect(mock.readFile).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps actual reset and welcome templates below the transport budget", async () => {
    await sendPasswordResetLinkEmail(input.to, link);
    await sendWelcomeEmailAfterRegistration(input.to);
    expect(mock.send).toHaveBeenCalledTimes(2);
    for (const [payload] of mock.send.mock.calls) {
      expect(payload.attachments).toBeUndefined();
      expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(12_000);
    }
    expect(mock.send.mock.calls[0][0].html).toContain(link);
    expect(mock.readFile).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("applies the same behavior to the disposition bridge", async () => {
    mock.sendWithDisposition.mockResolvedValue({ kind: "QUEUED" });
    await expect(sendTransactionalEmailWithLayoutDisposition(input)).resolves.toEqual({ kind: "QUEUED" });
    expect(mock.sendWithDisposition.mock.calls[0][0].attachments).toBeUndefined();
    expect(mock.readFile).not.toHaveBeenCalled();
  });

  it("preserves the existing SMTP inline logo behavior", async () => {
    mock.provider.mockReturnValue("smtp");
    await sendTransactionalEmailWithLayout(input);
    const payload = mock.send.mock.calls[0][0];
    expect(payload.attachments[0].content.length).toBe(242472);
    expect(payload.html).toContain("cid:gafus-logo@transactional");
    expect(mock.readFile).toHaveBeenCalledOnce();
  });
});
