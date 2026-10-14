import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ upsert: vi.fn(), update: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { transactionalMailAttempt: db } }));
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
import { sendResendMail } from "./resend.js";
import { isMailerConfigured, mailerEnvFromProcess } from "./env.js";

const env = {
  provider: "resend" as const, resendApiKey: "test-secret", smtpHost: "",
  smtpPort: 587, smtpSecure: false, mailFrom: "notifications@notify.gafus.ru",
};
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

  it("does not retry quota errors or fall back to SMTP", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ name: "daily_quota_exceeded", message: "private address" }, { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendResendMail(input, env)).rejects.toThrow("daily_quota_exceeded");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "FAILED", errorCode: "daily_quota_exceeded" } }));
  });

  it("retries ambiguous network failures within the request with the identical key and body", async () => {
    const cause = Object.assign(new Error("private: user@example.test?token=secret"), { code: "ETIMEDOUT" });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), { cause }))
      .mockResolvedValueOnce(Response.json({ id: "provider-id" }));
    vi.stubGlobal("fetch", fetchMock);
    await sendResendMail(input, env);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe(input.deliveryKey);
    expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe(input.deliveryKey);
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
    expect(db.update).toHaveBeenNthCalledWith(1, {
      where: { id: input.deliveryKey },
      data: { status: "UNKNOWN", errorCode: "NETWORK_ETIMEDOUT" },
    });
    expect(db.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ACCEPTED" }) }));
    expect(JSON.stringify(db.update.mock.calls)).not.toContain("private");
  });

  it("retries provider 503, handles malformed 200 and eventually accepts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ name: "internal_server_error" }, { status: 503 }))
      .mockResolvedValueOnce(new Response("not json", { status: 200 }))
      .mockResolvedValueOnce(Response.json({ id: "accepted" }));
    vi.stubGlobal("fetch", fetchMock);
    await sendResendMail(input, env);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(db.update.mock.calls.map(([arg]) => arg.data.status)).toEqual(["UNKNOWN", "UNKNOWN", "ACCEPTED"]);
    expect(db.update.mock.calls[1][0].data.errorCode).toBe("INVALID_PROVIDER_RESPONSE");
  });

  it("after three transport failures stores a safe code without leaking network details", async () => {
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error("recipient@example.test secret"), { cause: { code: "EAI_AGAIN" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendResendMail(input, env)).rejects.toThrow("NETWORK_EAI_AGAIN");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(db.update).toHaveBeenCalledTimes(3);
    expect(db.update.mock.calls.every(([arg]) => arg.data.status === "UNKNOWN")).toBe(true);
    expect(JSON.stringify(db.update.mock.calls)).not.toContain("recipient@example.test");
  });

  it("keeps the same key on a later business-level retry", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("private transport detail"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendResendMail(input, env)).rejects.toThrow("acceptance unknown");
    db.upsert.mockResolvedValue({ id: input.deliveryKey, status: "UNKNOWN", createdAt: new Date() });
    fetchMock.mockResolvedValue(Response.json({ id: "provider-id" }));
    await sendResendMail(input, env);
    expect(fetchMock.mock.calls[3][1].headers["Idempotency-Key"]).toBe(input.deliveryKey);
  });

  it("does not resend an accepted consultation", async () => {
    db.upsert.mockResolvedValue({ id: input.deliveryKey, status: "ACCEPTED" });
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await sendResendMail(input, env);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires manual reconciliation beyond Resend's 24-hour idempotency window", async () => {
    db.upsert.mockResolvedValue({ id: input.deliveryKey, status: "UNKNOWN", createdAt: new Date(0) });
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(sendResendMail(input, env)).rejects.toThrow("reconciliation");
    expect(fetchMock).not.toHaveBeenCalled();
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
