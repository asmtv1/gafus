import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ upsert: vi.fn(), update: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { transactionalMailAttempt: db } }));
import { sendResendMail } from "./resend.js";
import { isMailerConfigured, mailerEnvFromProcess } from "./env.js";
const env = { provider: "resend" as const, resendApiKey: "test-secret", smtpHost: "", smtpPort: 587, smtpSecure: false, mailFrom: "notifications@notify.gafus.ru" };
const input = { deliveryKey: "consultation-test", to: "test@example.test", subject: "Test", text: "Private text" };
beforeEach(() => {
  vi.clearAllMocks();
  db.upsert.mockResolvedValue({ id: input.deliveryKey, status: "PENDING", createdAt: new Date() });
  db.update.mockResolvedValue({});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Resend transport", () => {
  it("uses HTTPS, preserves inline images and records provider acceptance without body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "provider-id" }));
    vi.stubGlobal("fetch", fetchMock);
    await sendResendMail({ ...input, attachments: [{ filename: "logo.png", content: Buffer.from("logo"), cid: "logo", contentType: "image/png" }] }, env);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(request.headers["Idempotency-Key"]).toBe(input.deliveryKey);
    expect(JSON.parse(request.body).attachments[0]).toMatchObject({ content: "bG9nbw==", content_id: "logo" });
    expect(db.upsert.mock.calls[0][0].create).toEqual({ id: input.deliveryKey, recipientCount: 1 });
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ACCEPTED", providerMessageId: "provider-id" }) }));
  });
  it("records quota errors and never falls back to SMTP", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ name: "daily_quota_exceeded", message: "private address" }, { status: 429 })));
    await expect(sendResendMail(input, env)).rejects.toThrow("daily_quota_exceeded");
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "FAILED", errorCode: "daily_quota_exceeded" } }));
  });
  it("marks an ambiguous timeout unknown and retries with the same key", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("private transport detail"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendResendMail(input, env)).rejects.toThrow("acceptance unknown");
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "UNKNOWN", errorCode: "NETWORK_OR_TIMEOUT" } }));
    db.upsert.mockResolvedValue({ id: input.deliveryKey, status: "UNKNOWN", createdAt: new Date() });
    fetchMock.mockResolvedValue(Response.json({ id: "provider-id" }));
    await sendResendMail(input, env);
    expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe(input.deliveryKey);
  });
  it("does not resend an accepted consultation", async () => {
    db.upsert.mockResolvedValue({ id: input.deliveryKey, status: "ACCEPTED" });
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await sendResendMail(input, env);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("requires reconciliation once ambiguous acceptance exceeds the idempotency window", async () => {
    db.upsert.mockResolvedValue({ id: input.deliveryKey, status: "UNKNOWN", createdAt: new Date(0) });
    await expect(sendResendMail(input, env)).rejects.toThrow("reconciliation");
  });
  it("selects Resend from the secret while allowing explicit SMTP rollback", () => {
    vi.stubEnv("RESEND_API_KEY", "test-secret"); vi.stubEnv("MAIL_PROVIDER", ""); vi.stubEnv("RESEND_FROM", "");
    expect(mailerEnvFromProcess()).toMatchObject({ provider: "resend", mailFrom: "notifications@notify.gafus.ru" });
    expect(isMailerConfigured(env)).toBe(true);
    expect(isMailerConfigured({ ...env, resendApiKey: undefined })).toBe(false);
    vi.stubEnv("MAIL_PROVIDER", "smtp");
    expect(mailerEnvFromProcess().provider).toBe("smtp");
  });
});
