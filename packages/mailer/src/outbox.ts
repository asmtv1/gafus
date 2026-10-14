import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { prisma } from "@gafus/prisma";
import { sendResendMail } from "./resend.js";
import { mailerEnvFromProcess } from "./env.js";
import type { Attachment, SendTransactionalMailInput } from "./send-transactional-mail.js";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_QUEUE_AGE_MS = 20 * 60 * 60 * 1000;
const LEASE_MS = 90_000;
const RETRY_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000];

type StoredAttachment = { filename?: string; cid?: string; contentType?: string; contentDisposition?: "attachment" | "inline"; content: string };
type MailPayload = Omit<SendTransactionalMailInput, "attachments"> & { attachments?: StoredAttachment[] };

export function mailOutboxEnabled(): boolean {
  return process.env.MAIL_OUTBOX_ENABLED === "true";
}

function encryptionKey(): Buffer {
  const raw = process.env.MAIL_OUTBOX_ENCRYPTION_KEY;
  if (!raw || !/^[a-f0-9]{64}$/i.test(raw)) {
    throw new Error("MAIL_OUTBOX_ENCRYPTION_KEY must be 32 random bytes encoded as hex");
  }
  return Buffer.from(raw, "hex");
}

export function encryptMailPayload(payload: MailPayload, id: string): { ciphertext: string; nonce: string; authTag: string } {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8");
  if (encoded.length > MAX_BODY_BYTES) throw new Error("Mail payload exceeds safe encrypted queue limit");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(id));
  const ciphertext = Buffer.concat([cipher.update(encoded), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), nonce: nonce.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

export function decryptMailPayload(data: { ciphertext: string; nonce: string; authTag: string }, id: string): MailPayload {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(data.nonce, "base64"));
  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(Buffer.from(data.authTag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(data.ciphertext, "base64")), decipher.final()]);
  if (plain.length > MAX_BODY_BYTES) throw new Error("Mail payload exceeds safe encrypted queue limit");
  return JSON.parse(plain.toString("utf8")) as MailPayload;
}

async function serialize(input: SendTransactionalMailInput): Promise<MailPayload> {
  const attachments: StoredAttachment[] | undefined = input.attachments
    ? await Promise.all(input.attachments.map(async (file: Attachment) => {
        let bytes: Buffer;
        if (Buffer.isBuffer(file.content)) bytes = file.content;
        else if (typeof file.content === "string") bytes = Buffer.from(file.content, (file.encoding || "utf8") as BufferEncoding);
        else if (typeof file.path === "string" && !/^[a-z]+:/i.test(file.path)) bytes = await readFile(file.path);
        else throw new Error("Unsupported deferred email attachment");
        return {
          filename: typeof file.filename === "string" ? file.filename : undefined, content: bytes.toString("base64"),
          contentType: file.contentType, cid: file.cid, contentDisposition: file.contentDisposition,
        };
      }))
    : undefined;
  const { attachments: _files, ...rest } = input;
  return { ...rest, attachments };
}

function deserialize(data: MailPayload): SendTransactionalMailInput {
  return {
    ...data,
    attachments: data.attachments?.map((file) => ({
      ...file,
      content: Buffer.from(file.content, "base64"),
    })),
  };
}

export async function enqueueTransactionalMail(input: SendTransactionalMailInput): Promise<void> {
  // Validate key *before* writing any encrypted data.
  encryptionKey();
  const ttl = Math.min(Math.max(input.maxQueueAgeMs ?? 12 * 60 * 60_000, 1_000), MAX_QUEUE_AGE_MS);
  const id = input.deliveryKey || randomUUID();
  const now = new Date();
  const payload = await serialize({ ...input, deliveryKey: id });
  const { ciphertext, nonce, authTag } = encryptMailPayload(payload, id);
  const existing = await prisma.transactionalMailOutbox.upsert({
    where: { id },
    create: {
      id, status: "PENDING", ciphertext, nonce, authTag,
      expiresAt: new Date(now.getTime() + ttl),
      nextAttemptAt: now,
      category: input.category || "general",
    },
    update: {}, // Original ciphertext and key are immutable for idempotent replays.
  });
  if (existing.status === "FAILED" || existing.status === "EXPIRED") {
    throw new Error(`Mail outbox entry needs manual review (attempt ${id})`);
  }
}

function isPermanentFailure(code: string): boolean {
  if (/^(?:Resend )?(?:invalid_|missing_|validation_|not_found|forbidden|unauthorized|restricted_|HTTP_40[01345]|HTTP_422)/i.test(code)) return true;
  return /reconciliation/.test(code);
}

function errorCodeFromException(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  // No raw message, recipients or tokens stored; just bounded provider/transport identifiers.
  if (raw.includes("reconciliation")) return "IDEMPOTENCY_EXPIRED";
  if (raw.includes("MAIL_OUTBOX_ENCRYPTION_KEY")) return "KEY_CONFIGURATION";
  const match = /^Resend ([A-Za-z0-9_-]{1,80})\b/.exec(raw);
  if (match) return match[1]!;
  const network = /NETWORK_[A-Z0-9_]{1,72}/.exec(raw);
  return network?.[0] || "MAIL_TRANSPORT_FAILED";
}

export async function processDueTransactionalMailOutbox(params: { batchSize?: number; now?: Date } = {}) {
  if (!mailOutboxEnabled()) return { processed: 0, sent: 0, failed: 0, expired: 0, enabled: false };
  encryptionKey();
  const now = params.now ?? new Date();
  let processed = 0, sent = 0, failed = 0, expired = 0;
  const owner = randomUUID();
  const batchSize = Math.min(Math.max(params.batchSize ?? 10, 1), 30);
  for (let i = 0; i < batchSize; i++) {
    const checkAt = new Date();
    const candidate = await prisma.transactionalMailOutbox.findFirst({
      where: {
        OR: [
          { status: "PENDING", nextAttemptAt: { lte: checkAt } },
          { status: "PROCESSING", leaseExpiresAt: { lt: checkAt } },
        ],
      },
      select: { id: true },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    });
    if (!candidate) break;
    const claimed = await prisma.transactionalMailOutbox.updateMany({
      where: {
        id: candidate.id,
        OR: [
          { status: "PENDING", nextAttemptAt: { lte: checkAt } },
          { status: "PROCESSING", leaseExpiresAt: { lt: checkAt } },
        ],
      },
      data: {
        status: "PROCESSING", attempts: { increment: 1 },
        leaseOwner: owner, leaseExpiresAt: new Date(checkAt.getTime() + LEASE_MS),
      },
    });
    if (claimed.count !== 1) continue;
    const row = await prisma.transactionalMailOutbox.findUnique({ where: { id: candidate.id } });
    if (!row) continue;
    processed++;
    const finish = async (data: Record<string, unknown>) => prisma.transactionalMailOutbox.updateMany({
      where: { id: row.id, status: "PROCESSING", leaseOwner: owner },
      data: { ...data, leaseOwner: null, leaseExpiresAt: null },
    });
    // "expiresAt" always precedes Resend's 23h safe idempotency window.
    if (row.expiresAt.getTime() <= checkAt.getTime() ||
        checkAt.getTime() - row.createdAt.getTime() >= MAX_QUEUE_AGE_MS) {
      await finish({ status: "EXPIRED", ciphertext: null, nonce: null, authTag: null, lastErrorCode: "QUEUE_TTL_EXPIRED" });
      expired++;
      continue;
    }
    try {
      if (!row.ciphertext || !row.nonce || !row.authTag) throw new Error("Mail payload missing");
      const payload = decryptMailPayload({ ciphertext: row.ciphertext, nonce: row.nonce, authTag: row.authTag }, row.id);
      await sendResendMail(deserialize(payload), mailerEnvFromProcess());
      await finish({
        status: "SENT", ciphertext: null, nonce: null, authTag: null,
        acceptedAt: new Date(), lastErrorCode: null,
      });
      sent++;
    } catch (error) {
      const code = errorCodeFromException(error);
      const permanent = isPermanentFailure(error instanceof Error ? error.message : "") ||
        code === "IDEMPOTENCY_EXPIRED" || code === "KEY_CONFIGURATION" || code === "MAIL_TRANSPORT_FAILED" && !row.ciphertext;
      const delayMs = RETRY_MS[Math.min(row.attempts, RETRY_MS.length - 1)]!;
      const next = new Date(Date.now() + delayMs);
      const shouldStop = permanent || next >= row.expiresAt;
      await finish({
        status: shouldStop ? "FAILED" : "PENDING",
        lastErrorCode: code,
        nextAttemptAt: next,
        ...(shouldStop ? { ciphertext: null, nonce: null, authTag: null } : {}),
      });
      failed++;
    }
  }
  return { processed, sent, failed, expired, enabled: true };
}
