import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Webhook } from "svix";
const db = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { transactionalMailEvent: db } }));
import { receiveResendWebhook } from "./webhook.js";
const secret = `whsec_${Buffer.from("test-webhook-secret").toString("base64")}`;
function request(valid = true) {
  const body = JSON.stringify({ type: "email.delivered", created_at: new Date().toISOString(), data: { email_id: "provider-id", to: ["private@example.test"] } });
  const time = new Date();
  return new Request("https://example.test/api/webhooks/resend", { method: "POST", body, headers: {
    "svix-id": "event-id", "svix-timestamp": String(Math.floor(time.getTime() / 1000)),
    "svix-signature": valid ? new Webhook(secret).sign("event-id", time, body) : "v1,invalid",
  } });
}
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("RESEND_WEBHOOK_SECRET", secret); db.upsert.mockResolvedValue({}); });
afterEach(() => vi.unstubAllEnvs());
it("verifies signed events, deduplicates and excludes personal payload fields", async () => {
  expect((await receiveResendWebhook(request())).status).toBe(200);
  expect((await receiveResendWebhook(request())).status).toBe(200);
  expect(db.upsert).toHaveBeenCalledWith({ where: { id: "event-id" }, create: {
    id: "event-id", providerMessageId: "provider-id", type: "email.delivered", occurredAt: expect.any(Date), errorCode: null,
  }, update: {} });
});
it("rejects forged events without persisting", async () => {
  expect((await receiveResendWebhook(request(false))).status).toBe(400);
  expect(db.upsert).not.toHaveBeenCalled();
});
it("returns retryable error on persistence failure", async () => {
  db.upsert.mockRejectedValue(new Error("DB offline"));
  expect((await receiveResendWebhook(request())).status).toBe(503);
});
it("fails closed without signing secret", async () => {
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
  expect((await receiveResendWebhook(request())).status).toBe(503);
});

it("stores normalized bounce reason", async () => {
  const body = JSON.stringify({ type: "email.bounced", created_at: new Date().toISOString(), data: {
    email_id: "provider-id", bounce: { type: "Permanent", subType: "MailboxFull", message: "private recipient" },
  } });
  const time = new Date();
  const req = new Request("https://example.test", { method: "POST", body, headers: {
    "svix-id": "bounce-id", "svix-timestamp": String(Math.floor(time.getTime() / 1000)),
    "svix-signature": new Webhook(secret).sign("bounce-id", time, body),
  } });
  expect((await receiveResendWebhook(req)).status).toBe(200);
  expect(db.upsert.mock.calls[0][0].create.errorCode).toBe("Permanent/MailboxFull");
  expect(JSON.stringify(db.upsert.mock.calls[0][0])).not.toContain("private recipient");
});
it("rejects an expired signed request", async () => {
  const body = "{}"; const time = new Date(0);
  const req = new Request("https://example.test", { method: "POST", body, headers: {
    "svix-id": "expired", "svix-timestamp": "0", "svix-signature": new Webhook(secret).sign("expired", time, body),
  } });
  expect((await receiveResendWebhook(req)).status).toBe(400);
  expect(db.upsert).not.toHaveBeenCalled();
});
