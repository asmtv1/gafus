import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  upsert: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(),
}));
const sendResend = vi.hoisted(() => vi.fn());
const attemptRead = vi.hoisted(() => vi.fn());
vi.mock("@gafus/prisma", () => ({
  prisma: { transactionalMailOutbox: db, transactionalMailAttempt: { findUnique: attemptRead } },
}));
vi.mock("./resend.js", () => ({ sendResendMail: sendResend }));
import {
  decryptMailPayload, encryptMailPayload, enqueueTransactionalMail,
  processDueTransactionalMailOutbox,
} from "./outbox.js";

const key = "11".repeat(32);
const sensitiveMail = {
  deliveryKey: "consultation-mail-1", to: "private@example.test",
  subject: "Private", text: "reset secret xyz", html: "<p>secret url</p>",
  category: "consultation" as const,
  attachments: [{ filename: "receipt.png", content: Buffer.from("private logo"), cid: "logo" }],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MAIL_OUTBOX_ENABLED", "true");
  vi.stubEnv("MAIL_OUTBOX_ENCRYPTION_KEY", key);
  vi.stubEnv("RESEND_API_KEY", "test-secret");
  vi.stubEnv("MAIL_PROVIDER", "resend");
  db.upsert.mockImplementation(async (query) => ({ ...query.create }));
  db.updateMany.mockResolvedValue({ count: 1 });
  attemptRead.mockResolvedValue(null);
  sendResend.mockImplementation(async () => {
    attemptRead.mockResolvedValue({
      status: "ACCEPTED", providerMessageId: "provider-1",
      acceptedAt: new Date("2026-10-21T12:01:02.000Z"),
    });
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("encrypted transactional mail outbox", () => {
  it("encrypts PII with authenticated encryption and rejects tampering", () => {
    const envelope = encryptMailPayload(
      { ...sensitiveMail, attachments: undefined }, sensitiveMail.deliveryKey,
    );
    expect(JSON.stringify(envelope)).not.toContain("private");
    expect(decryptMailPayload(envelope, sensitiveMail.deliveryKey)).toMatchObject({
      text: "reset secret xyz", to: "private@example.test",
    });
    expect(() => decryptMailPayload(envelope, "another-id")).toThrow();
    const tampered = { ...envelope, authTag: Buffer.alloc(16).toString("base64") };
    expect(() => decryptMailPayload(tampered, sensitiveMail.deliveryKey)).toThrow();
  });

  it("stores opaque encrypted bytes only, retaining a stable idempotency key", async () => {
    await enqueueTransactionalMail(sensitiveMail);
    const create = db.upsert.mock.calls[0][0].create;
    expect(create).toMatchObject({
      id: "consultation-mail-1", status: "PENDING", category: "consultation",
    });
    expect(JSON.stringify(create)).not.toContain("private");
    expect(JSON.stringify(create)).not.toContain("secret");
    const payload = decryptMailPayload(create, create.id);
    expect(payload).toMatchObject({ to: "private@example.test", deliveryKey: create.id });
    expect(payload.attachments?.[0].content).toEqual(Buffer.from("private logo").toString("base64"));
    expect(db.upsert.mock.calls[0][0].update).toEqual({});
  });

  it("rejects unsupported deferred Nodemailer 10 content disposition before DB write", async () => {
    const unsupported = {
      ...sensitiveMail,
      attachments: [{
        filename: "receipt.png",
        content: Buffer.from("private logo"),
        contentDisposition: "x-unsafe-custom",
      }],
    };
    await expect(enqueueTransactionalMail(unsupported)).rejects.toThrow(
      "Unsupported deferred email content disposition",
    );
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("retains standard inline content disposition in encrypted outbox", async () => {
    await enqueueTransactionalMail({
      ...sensitiveMail,
      attachments: [{
        filename: "receipt.png",
        content: Buffer.from("private logo"),
        contentDisposition: "inline",
      }],
    });
    const entry = db.upsert.mock.calls[0][0].create;
    const payload = decryptMailPayload(entry, entry.id);
    expect(payload.attachments?.[0]?.contentDisposition).toBe("inline");
  });

  it("fails closed when encryption is missing or malformed", async () => {
    vi.stubEnv("MAIL_OUTBOX_ENCRYPTION_KEY", "");
    await expect(enqueueTransactionalMail(sensitiveMail)).rejects.toThrow("MAIL_OUTBOX_ENCRYPTION_KEY");
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("delivers queued mail once under an atomic lease and purges plaintext ciphertext", async () => {
    const encrypted = encryptMailPayload(
      { ...sensitiveMail, attachments: undefined }, sensitiveMail.deliveryKey,
    );
    const row = {
      ...encrypted, id: sensitiveMail.deliveryKey, status: "PROCESSING",
      attempts: 1, createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    };
    db.findFirst.mockResolvedValueOnce({ id: row.id }).mockResolvedValueOnce(null);
    db.findUnique.mockResolvedValue(row);
    const result = await processDueTransactionalMailOutbox({ batchSize: 5 });
    expect(result).toMatchObject({ processed: 1, sent: 1, failed: 0 });
    expect(sendResend).toHaveBeenCalledWith(expect.objectContaining({
      deliveryKey: row.id, to: "private@example.test",
    }), expect.objectContaining({ provider: "resend" }));
    const finished = db.updateMany.mock.calls[1][0];
    expect(finished.where).toMatchObject({ status: "PROCESSING", leaseOwner: expect.any(String) });
    expect(finished.data).toMatchObject({
      status: "SENT", ciphertext: null, nonce: null, authTag: null,
    });
  });

  it("defers a transient 429 without reusing a different delivery key", async () => {
    const encrypted = encryptMailPayload(
      { ...sensitiveMail, attachments: undefined }, sensitiveMail.deliveryKey,
    );
    const row = {
      ...encrypted, id: sensitiveMail.deliveryKey, attempts: 1,
      createdAt: new Date(), expiresAt: new Date(Date.now() + 20 * 60_000),
    };
    db.findFirst.mockResolvedValueOnce({ id: row.id }).mockResolvedValueOnce(null);
    db.findUnique.mockResolvedValue(row);
    sendResend.mockRejectedValue(new Error("Resend daily_quota_exceeded (attempt consultation-mail-1)"));
    const result = await processDueTransactionalMailOutbox();
    expect(result).toMatchObject({ failed: 1 });
    expect(db.updateMany.mock.calls[1][0].data).toMatchObject({
      status: "PENDING", lastErrorCode: "daily_quota_exceeded",
    });
    expect(db.updateMany.mock.calls[1][0].data.ciphertext).toBeUndefined();
  });

  it("stops expired mails before sending and wipes encrypted content", async () => {
    const encrypted = encryptMailPayload(
      { ...sensitiveMail, attachments: undefined }, sensitiveMail.deliveryKey,
    );
    const row = {
      ...encrypted, id: sensitiveMail.deliveryKey, attempts: 1,
      createdAt: new Date(Date.now() - 3600_000),
      expiresAt: new Date(Date.now() - 1),
    };
    db.findFirst.mockResolvedValueOnce({ id: row.id }).mockResolvedValueOnce(null);
    db.findUnique.mockResolvedValue(row);
    const result = await processDueTransactionalMailOutbox();
    expect(result).toMatchObject({ expired: 1, sent: 0 });
    expect(sendResend).not.toHaveBeenCalled();
    expect(db.updateMany.mock.calls[1][0].data).toMatchObject({
      status: "EXPIRED", ciphertext: null, nonce: null, authTag: null,
    });
  });

  it("finish count zero never reports provider accepted or calls reconciliation", async () => {
    const row = { id: sensitiveMail.deliveryKey, status: "PROCESSING", attempts: 1,
      ...encryptMailPayload(
        { ...sensitiveMail, attachments: undefined }, sensitiveMail.deliveryKey,
      ),
      createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) };
    db.findFirst.mockResolvedValueOnce({ id: row.id }).mockResolvedValueOnce(null);
    db.findUnique.mockResolvedValue(row);
    db.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const callback = vi.fn();
    const result = await processDueTransactionalMailOutbox({
      batchSize: 1, onTerminalCommitted: callback,
    });
    expect(result.sent).toBe(0);
    expect(callback).not.toHaveBeenCalled();
    expect(sendResend).toHaveBeenCalledOnce();
  });

  it("post-provider outbox DB write fault does not reenter provider catch/failed update", async () => {
    const row = { id: sensitiveMail.deliveryKey, status: "PROCESSING", attempts: 1,
      ...encryptMailPayload(
        { ...sensitiveMail, attachments: undefined }, sensitiveMail.deliveryKey,
      ),
      createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) };
    db.findFirst.mockResolvedValueOnce({ id: row.id });
    db.findUnique.mockResolvedValue(row);
    db.updateMany.mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error("PRIVATE_DB_ACK_FAULT"));
    const callback = vi.fn();
    await expect(processDueTransactionalMailOutbox({
      batchSize: 1, onTerminalCommitted: callback,
    })).rejects.toThrow("PRIVATE_DB_ACK_FAULT");
    expect(db.updateMany).toHaveBeenCalledTimes(2);
    expect(sendResend).toHaveBeenCalledOnce();
    expect(callback).not.toHaveBeenCalled();
  });

  it("durable outbox SENT uses persisted attempt acceptedAt, callback once", async () => {
    const row = { id: sensitiveMail.deliveryKey, status: "PROCESSING", attempts: 1,
      ...encryptMailPayload(
        { ...sensitiveMail, attachments: undefined }, sensitiveMail.deliveryKey,
      ),
      createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) };
    db.findFirst.mockResolvedValueOnce({ id: row.id }).mockResolvedValueOnce(null);
    db.findUnique.mockResolvedValue(row);
    const callback = vi.fn().mockResolvedValue(undefined);
    const result = await processDueTransactionalMailOutbox({
      batchSize: 2, onTerminalCommitted: callback,
    });
    expect(result).toMatchObject({ sent: 1, reconciliationFailures: 0 });
    expect(db.updateMany.mock.calls[1][0].data.acceptedAt)
      .toEqual(new Date("2026-10-21T12:01:02.000Z"));
    expect(callback).toHaveBeenCalledExactlyOnceWith(sensitiveMail.deliveryKey);
  });

  it("unknown persisted attempt holds without sending again", async () => {
    const row = { id: sensitiveMail.deliveryKey, status: "PROCESSING", attempts: 1,
      ...encryptMailPayload(
        { ...sensitiveMail, attachments: undefined }, sensitiveMail.deliveryKey,
      ),
      createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) };
    db.findFirst.mockResolvedValueOnce({ id: row.id }).mockResolvedValueOnce(null);
    db.findUnique.mockResolvedValue(row);
    attemptRead.mockResolvedValue({ status: "UNKNOWN" });
    const result = await processDueTransactionalMailOutbox();
    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(sendResend).not.toHaveBeenCalled();
    expect(db.updateMany.mock.calls[1][0].data).toMatchObject({
      status: "PENDING", nextAttemptAt: row.expiresAt,
      lastErrorCode: "PROVIDER_ACCEPTANCE_UNKNOWN",
    });
  });

  it("reconciliation callback fault cannot trigger another send", async () => {
    const row = { id: sensitiveMail.deliveryKey, status: "PROCESSING", attempts: 1,
      ...encryptMailPayload(
        { ...sensitiveMail, attachments: undefined }, sensitiveMail.deliveryKey,
      ),
      createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) };
    db.findFirst.mockResolvedValueOnce({ id: row.id }).mockResolvedValueOnce(null);
    db.findUnique.mockResolvedValue(row);
    const callback = vi.fn().mockRejectedValue(new Error("PRIVATE_RECONCILE_SQL_FAULT"));
    const result = await processDueTransactionalMailOutbox({
      batchSize: 2, onTerminalCommitted: callback,
    });
    expect(result).toMatchObject({ sent: 1, reconciliationFailures: 1 });
    expect(sendResend).toHaveBeenCalledOnce();
    expect(db.updateMany).toHaveBeenCalledTimes(2);
  });

  it("stranded PENDING after terminal callback DB fault: one alert count, no dequeue retry", async () => {
    const row = {
      id: sensitiveMail.deliveryKey, status: "PROCESSING", attempts: 1,
      ...encryptMailPayload(
        { ...sensitiveMail, attachments: undefined }, sensitiveMail.deliveryKey,
      ),
      createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    };
    db.findFirst.mockResolvedValueOnce({ id: row.id })
      .mockResolvedValueOnce(null);
    db.findUnique.mockResolvedValue(row);
    const consultationStatus = "PENDING";
    const callback = vi.fn().mockImplementation(async () => {
      // Synthetic read-only Core reconciliation attempt encounters DB outage.
      expect(consultationStatus).toBe("PENDING");
      throw new Error("PRIVATE_DB_CALLBACK_ERROR");
    });
    const first = await processDueTransactionalMailOutbox({
      batchSize: 1, onTerminalCommitted: callback,
    });
    expect(first).toMatchObject({
      processed: 1, sent: 1, reconciliationFailures: 1,
    });
    expect(db.updateMany.mock.calls[1][0].data.status).toBe("SENT");
    expect(consultationStatus).toBe("PENDING");
    expect(callback).toHaveBeenCalledOnce();
    expect(sendResend).toHaveBeenCalledOnce();
    const later = await processDueTransactionalMailOutbox({
      batchSize: 1, onTerminalCommitted: callback,
    });
    expect(later).toMatchObject({ processed: 0, sent: 0 });
    expect(callback).toHaveBeenCalledOnce();
    expect(sendResend).toHaveBeenCalledOnce();
    expect(JSON.stringify(first)).not.toContain("PRIVATE_DB_CALLBACK_ERROR");
  });

  it("accepted attempt at expired TTL never sends provider and flags manual review", async () => {
    const row = {
      id: sensitiveMail.deliveryKey, status: "PROCESSING", attempts: 1,
      ...encryptMailPayload(
        { ...sensitiveMail, attachments: undefined }, sensitiveMail.deliveryKey,
      ),
      createdAt: new Date(Date.now() - 3600_000),
      expiresAt: new Date(Date.now() - 5_000),
    };
    db.findFirst.mockResolvedValueOnce({ id: row.id }).mockResolvedValueOnce(null);
    db.findUnique.mockResolvedValue(row);
    attemptRead.mockResolvedValue({
      status: "ACCEPTED", providerMessageId: "provider-1",
      acceptedAt: new Date("2026-10-21T12:01:02Z"),
    });
    const callback = vi.fn().mockRejectedValueOnce(
      new Error("CONSULTATION_MAIL_TERMINAL_REVIEW"),
    );
    const result = await processDueTransactionalMailOutbox({
      batchSize: 1, onTerminalCommitted: callback,
    });
    expect(result).toMatchObject({
      processed: 1, sent: 0, expired: 1, reconciliationFailures: 1,
    });
    expect(db.updateMany.mock.calls[1][0].data.status).toBe("EXPIRED");
    expect(callback).toHaveBeenCalledExactlyOnceWith(sensitiveMail.deliveryKey);
    expect(sendResend).not.toHaveBeenCalled();
  });

  it("prevents claiming the same job concurrently", async () => {
    db.findFirst.mockResolvedValueOnce({ id: sensitiveMail.deliveryKey })
      .mockResolvedValueOnce(null);
    db.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await processDueTransactionalMailOutbox();
    expect(result).toMatchObject({ processed: 0, sent: 0 });
    expect(sendResend).not.toHaveBeenCalled();
  });
});
