import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  upsert: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(),
}));
const sendResend = vi.hoisted(() => vi.fn());
vi.mock("@gafus/prisma", () => ({
  prisma: { transactionalMailOutbox: db },
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
  vi.clearAllMocks();
  vi.stubEnv("MAIL_OUTBOX_ENABLED", "true");
  vi.stubEnv("MAIL_OUTBOX_ENCRYPTION_KEY", key);
  vi.stubEnv("RESEND_API_KEY", "test-secret");
  vi.stubEnv("MAIL_PROVIDER", "resend");
  db.upsert.mockImplementation(async (query) => ({ ...query.create }));
  db.updateMany.mockResolvedValue({ count: 1 });
  sendResend.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("encrypted transactional mail outbox", () => {
  it("encrypts PII with authenticated encryption and rejects tampering", () => {
    const envelope = encryptMailPayload({ ...sensitiveMail, attachments: undefined }, sensitiveMail.deliveryKey);
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

  it("fails closed when encryption is missing or malformed", async () => {
    vi.stubEnv("MAIL_OUTBOX_ENCRYPTION_KEY", "");
    await expect(enqueueTransactionalMail(sensitiveMail)).rejects.toThrow("MAIL_OUTBOX_ENCRYPTION_KEY");
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("delivers queued mail once under an atomic lease and purges plaintext ciphertext", async () => {
    const encrypted = encryptMailPayload({ ...sensitiveMail, attachments: undefined }, sensitiveMail.deliveryKey);
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
    const encrypted = encryptMailPayload({ ...sensitiveMail, attachments: undefined }, sensitiveMail.deliveryKey);
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
    const encrypted = encryptMailPayload({ ...sensitiveMail, attachments: undefined }, sensitiveMail.deliveryKey);
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

  it("prevents claiming the same job concurrently", async () => {
    db.findFirst.mockResolvedValueOnce({ id: sensitiveMail.deliveryKey }).mockResolvedValueOnce(null);
    db.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await processDueTransactionalMailOutbox();
    expect(result).toMatchObject({ processed: 0, sent: 0 });
    expect(sendResend).not.toHaveBeenCalled();
  });
});
