import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { prisma } from "@gafus/prisma";
import { formatMailFromHeader, isMailerConfigured, type MailerEnv } from "./env.js";
import { attemptTagFromId } from "./attempt-tag.js";
import type { Attachment, SendTransactionalMailInput } from "./send-transactional-mail.js";

const MAX_ATTEMPTS = 3;
const MAX_IDEMPOTENCY_AGE_MS = 23 * 60 * 60 * 1000;
const BACKOFF_MS = [400, 1200];

// Only record well-known transport codes. Never persist raw exception messages:
// undici/provider errors can contain recipient data, URLs, headers or tokens.
const NETWORK_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT",
  "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH",
  "EAI_AGAIN", "ENOTFOUND", "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

function classifyNetworkError(error: unknown): string {
  const seen = new Set<unknown>();
  const codes: string[] = [];
  function visit(candidate: unknown, depth: number): void {
    if (depth > 4 || !candidate || typeof candidate !== "object" || seen.has(candidate)) return;
    seen.add(candidate);
    const value = candidate as { code?: unknown; name?: unknown; cause?: unknown; errors?: unknown };
    if (typeof value.code === "string" && NETWORK_CODES.has(value.code)) codes.push(value.code);
    if (value.name === "TimeoutError" || value.name === "AbortError") codes.push("TIMEOUT");
    visit(value.cause, depth + 1);
    if (Array.isArray(value.errors)) {
      for (const nested of value.errors.slice(0, 4)) visit(nested, depth + 1);
    }
  }
  visit(error, 0);
  return `NETWORK_${codes[0] ?? "OTHER"}`;
}

function providerErrorCode(payload: { name?: unknown } | null, status: number): string {
  // The provider error name is a bounded identifier, never the error message.
  const name = typeof payload?.name === "string" ? payload.name : "";
  return name.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || `HTTP_${status}`;
}

async function encodeAttachment(attachment: Attachment) {
  let content: Buffer;
  if (Buffer.isBuffer(attachment.content)) content = attachment.content;
  else if (typeof attachment.content === "string") {
    content = Buffer.from(attachment.content, (attachment.encoding || "utf8") as BufferEncoding);
  } else if (typeof attachment.path === "string" && !/^[a-z]+:/i.test(attachment.path)) {
    content = await readFile(attachment.path);
  } else {
    // Never silently drop a receipt or inline image; unsupported inputs fail before sending.
    throw new Error("Unsupported Resend attachment: use a Buffer, string or local path");
  }
  return {
    filename: attachment.filename || "attachment",
    content: content.toString("base64"),
    content_type: attachment.contentType,
    content_id: attachment.cid,
  };
}

export async function sendResendMail(input: SendTransactionalMailInput, env: MailerEnv): Promise<void> {
  if (!isMailerConfigured(env)) throw new Error("Resend is not configured");
  const attachments = input.attachments ? await Promise.all(input.attachments.map(encodeAttachment)) : undefined;
  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  // Persist intent before contacting the provider. No email bodies or reset tokens in the journal.
  const attemptId = input.deliveryKey || randomUUID();
  const attempt = await prisma.transactionalMailAttempt.upsert({
    where: { id: attemptId },
    create: { id: attemptId, recipientCount: recipients.length, correlationVersion: 1 },
    update: {},
  });
  if (attempt.status === "ACCEPTED") return;

  const assertWithinIdempotencyWindow = () => {
    // Resend only retains keys for 24h; never silently create a duplicate beyond that.
    if (Date.now() - attempt.createdAt.getTime() > MAX_IDEMPOTENCY_AGE_MS) {
      throw new Error(`Resend acceptance requires reconciliation (attempt ${attempt.id})`);
    }
  };
  assertWithinIdempotencyWindow();

  // Every retry reuses the *identical* body and provider idempotency key.
  // There is intentionally no SMTP fallback and no automatic background replay of old messages.
  const correlationTag = attempt.correlationVersion === 1
    ? attemptTagFromId(attempt.id)
    : undefined;
  const body = JSON.stringify({
    // Provider webhook events carry tags, allowing confirmation when the HTTP
    // response was lost after Resend accepted the request.
    ...(correlationTag ? { tags: [{ name: "gafus_attempt", value: correlationTag }] } : {}),
    from: formatMailFromHeader(env),
    to: recipients,
    subject: input.subject,
    text: input.text,
    html: input.html,
    reply_to: input.replyTo || env.mailReplyTo,
    attachments,
  });

  async function persistUnconfirmed(status: "UNKNOWN" | "FAILED", errorCode: string): Promise<boolean> {
    // A webhook may already have confirmed acceptance while fetch was waiting.
    // Never replace ACCEPTED with a late transport failure.
    const result = await prisma.transactionalMailAttempt.updateMany({
      where: { id: attempt.id, status: { in: ["PENDING", "UNKNOWN"] } },
      data: { status, errorCode },
    });
    if (result.count > 0) return false;
    const current = await prisma.transactionalMailAttempt.findUnique({
      where: { id: attempt.id },
      select: { status: true },
    });
    return current?.status === "ACCEPTED";
  }

  for (let number = 0; number < MAX_ATTEMPTS; number++) {
    if (number > 0) {
      await delay(BACKOFF_MS[number - 1]);
      assertWithinIdempotencyWindow();
    }

    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.id,
        },
        body,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      const code = classifyNetworkError(error);
      if (await persistUnconfirmed("UNKNOWN", code)) return;
      if (number < MAX_ATTEMPTS - 1) continue;
      throw new Error(`Resend transport failed (${code}); acceptance unknown (attempt ${attempt.id})`);
    }

    const payload = await response.json().catch(() => null) as { id?: unknown; name?: unknown } | null;
    if (response.ok && typeof payload?.id === "string" && payload.id) {
      await prisma.transactionalMailAttempt.update({
        where: { id: attempt.id },
        data: { status: "ACCEPTED", providerMessageId: payload.id, acceptedAt: new Date(), errorCode: null },
      });
      return;
    }

    // 5xx or malformed 2xx may mean acceptance happened; use the same key to retry.
    // 409 concurrent_idempotent_requests is safe to retry with the same key;
    // rate limits, auth failures, validation failures and other 4xx are not.
    const ambiguous = response.status >= 500 || response.ok ||
      (response.status === 409 && providerErrorCode(payload, response.status) === "concurrent_idempotent_requests");
    const code = response.ok ? "INVALID_PROVIDER_RESPONSE" : providerErrorCode(payload, response.status);
    if (await persistUnconfirmed(ambiguous ? "UNKNOWN" : "FAILED", code)) return;
    if (ambiguous && number < MAX_ATTEMPTS - 1) continue;
    throw new Error(`Resend ${code} (attempt ${attempt.id})`);
  }
}
