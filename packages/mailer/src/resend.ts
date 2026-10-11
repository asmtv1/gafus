import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { prisma } from "@gafus/prisma";
import { formatMailFromHeader, isMailerConfigured, type MailerEnv } from "./env.js";
import type { Attachment, SendTransactionalMailInput } from "./send-transactional-mail.js";

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
    create: { id: attemptId, recipientCount: recipients.length },
    update: {},
  });
  if (attempt.status === "ACCEPTED") return;
  if ((attempt.status === "UNKNOWN" || attempt.status === "PENDING") &&
      Date.now() - attempt.createdAt.getTime() > 23 * 60 * 60 * 1000) {
    throw new Error(`Resend acceptance requires reconciliation (attempt ${attempt.id})`);
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
      body: JSON.stringify({
        from: formatMailFromHeader(env),
        to: recipients,
        subject: input.subject,
        text: input.text,
        html: input.html,
        reply_to: input.replyTo || env.mailReplyTo,
        attachments,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    await prisma.transactionalMailAttempt.update({
      where: { id: attempt.id }, data: { status: "UNKNOWN", errorCode: "NETWORK_OR_TIMEOUT" },
    });
    throw new Error(`Resend transport failed; acceptance unknown (attempt ${attempt.id})`);
  }
  const payload = await response.json().catch(() => null) as { id?: string; name?: string } | null;
  if (!response.ok || typeof payload?.id !== "string" || !payload.id) {
    // Provider messages can contain recipient addresses; only retain a bounded code.
    const code = payload?.name?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || `HTTP_${response.status}`;
    await prisma.transactionalMailAttempt.update({
      where: { id: attempt.id }, data: { status: response.ok || response.status >= 500 ? "UNKNOWN" : "FAILED", errorCode: code },
    });
    throw new Error(`Resend ${code} (attempt ${attempt.id})`);
  }
  await prisma.transactionalMailAttempt.update({
    where: { id: attempt.id },
    data: { status: "ACCEPTED", providerMessageId: payload.id, acceptedAt: new Date() },
  });
}
