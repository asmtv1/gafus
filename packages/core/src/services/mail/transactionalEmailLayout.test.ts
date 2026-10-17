import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ findUnique: vi.fn(), sendMail: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: { transactionalMailAttempt: { findUnique: state.findUnique } },
}));
vi.mock("@gafus/mailer", () => ({ sendTransactionalMail: state.sendMail }));
vi.mock("./publicWebBaseUrl", () => ({ getPublicWebBaseUrl: () => "https://gafus.ru" }));

import { sendTransactionalEmailWithLayout } from "./transactionalEmailLayout";

const input = {
  deliveryKey: "new-consultation", to: "private@example.test",
  subject: "Подтверждение", text: "Проверьте письмо",
  blocksHtml: ["<p>Здравствуйте!</p>"],
};

beforeEach(() => {
  vi.clearAllMocks();
  state.findUnique.mockResolvedValue(null);
  state.sendMail.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe("transactional email logo payload size", () => {
  it("does not download or attach the 242-KB logo for new attempts", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await sendTransactionalEmailWithLayout(input);
    expect(state.findUnique).toHaveBeenCalledWith({
      where: { id: "new-consultation" }, select: { correlationVersion: true },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const mail = state.sendMail.mock.calls[0][0];
    expect(mail.attachments).toBeUndefined();
    expect(mail.html).toContain('src="https://gafus.ru/uploads/logo.png"');
    expect(mail.html).not.toContain("cid:gafus-logo@transactional");
    expect(Buffer.byteLength(JSON.stringify(mail))).toBeLessThan(8000);
  });

  it("preserves the original CID body for existing version-0 idempotency keys", async () => {
    state.findUnique.mockResolvedValue({ correlationVersion: 0 });
    const logo = new Uint8Array(100).fill(42);
    const fetchMock = vi.fn().mockResolvedValue(new Response(logo, {
      headers: { "content-type": "image/png" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await sendTransactionalEmailWithLayout({ ...input, deliveryKey: "legacy-key" });
    const mail = state.sendMail.mock.calls[0][0];
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mail.html).toContain("cid:gafus-logo@transactional");
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0]).toMatchObject({ cid: "gafus-logo@transactional" });
    expect(mail.attachments[0].content.equals(Buffer.from(logo))).toBe(true);
  });

  it("skips the database lookup for generated one-time mail keys", async () => {
    await sendTransactionalEmailWithLayout({ ...input, deliveryKey: undefined });
    expect(state.findUnique).not.toHaveBeenCalled();
    expect(state.sendMail.mock.calls[0][0].attachments).toBeUndefined();
  });
});
