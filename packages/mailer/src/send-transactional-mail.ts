import { sendResendMail } from "./resend.js";
import { enqueueTransactionalMail, mailOutboxEnabled } from "./outbox.js";
import nodemailer from "nodemailer";
import { prisma } from "@gafus/prisma";
import type { Attachment } from "nodemailer/lib/mailer/index.js";
import type { Transporter } from "nodemailer";

import {
  type MailerEnv,
  formatMailFromHeader,
  isMailerConfigured,
  mailerEnvFromProcess,
} from "./env.js";

export type { Attachment };

export interface SendTransactionalMailInput {
  deliveryKey?: string;
  /** Use "immediate" for security links/one-time codes; they must not arrive late. */
  deliveryMode?: "immediate" | "deferred";
  /** Deferred delivery stops completely after this many milliseconds. */
  maxQueueAgeMs?: number;
  /** Safe category name for aggregated admin monitoring (no user metadata). */
  category?: "auth" | "welcome" | "consultation" | "receipt" | "subscription" | "notice" | "general";
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** Вложения (в т.ч. inline с cid для логотипа в HTML). */
  attachments?: Attachment[];
}

/**
 * Создаёт transporter для одной отправки или пула (без пула — вызывать из sendTransactionalMail).
 */
export function createMailerTransporter(env: MailerEnv = mailerEnvFromProcess()): Transporter {
  if (env.provider === "resend") {
    throw new Error("SMTP transporter is unavailable when MAIL_PROVIDER=resend");
  }
  if (!isMailerConfigured(env)) {
    throw new Error("Почта не настроена: задайте SMTP_HOST и MAIL_FROM");
  }

  const hasAuth = Boolean(env.smtpUser && env.smtpPass);
  const port = env.smtpPort;
  // SMTP без auth и secure=false считаем локальным/dev relay и не поднимаем STARTTLS принудительно.
  // SMTP с логином (production Яндекс 360) оставляет обычное поведение nodemailer.
  const ignoreTLS = !env.smtpSecure && !hasAuth;

  return nodemailer.createTransport({
    host: env.smtpHost,
    port,
    secure: env.smtpSecure,
    requireTLS: false,
    ignoreTLS,
    auth: hasAuth ? { user: env.smtpUser!, pass: env.smtpPass! } : undefined,
  });
}

/**
 * Отправка одного транзакционного письма (сброс пароля, смена email и т.д.).
 */
export async function sendTransactionalMail(
  input: SendTransactionalMailInput,
  env: MailerEnv = mailerEnvFromProcess(),
): Promise<void> {
  if (env.provider === "resend") {
    if (mailOutboxEnabled() && input.deliveryMode !== "immediate") {
      await enqueueTransactionalMail(input);
      return;
    }
    await sendResendMail(input, env);
    return;
  }
  const transporter = createMailerTransporter(env);
  const from = formatMailFromHeader(env);

  await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo,
    // The public Mailer.Attachment type accepts URL paths and nested AttachmentLike raw;
    // sendMail's internal composer declaration is narrower. Nodemailer supports both at runtime.
    attachments: input.attachments as unknown as Parameters<typeof transporter.sendMail>[0]["attachments"],
  });
}

/** Additive trusted delivery outcome: enqueue is NOT a provider acceptance. */
export type TransactionalMailDisposition =
  | { kind: "QUEUED" }
  | { kind: "PROVIDER_ACCEPTED"; acceptedAt: Date };

/** Unchanged delivery transport; only report ACCEPTED if persisted evidence exists. */
export async function sendTransactionalMailWithDisposition(
  input: SendTransactionalMailInput,
  env: MailerEnv = mailerEnvFromProcess(),
): Promise<TransactionalMailDisposition> {
  await sendTransactionalMail(input, env);
  if (env.provider !== "resend" ||
      mailOutboxEnabled() && input.deliveryMode !== "immediate" ||
      !input.deliveryKey) {
    return { kind: "QUEUED" };
  }
  const attempt = await prisma.transactionalMailAttempt.findUnique({
    where: { id: input.deliveryKey },
    select: { status: true, acceptedAt: true, providerMessageId: true },
  });
  if (attempt?.status === "ACCEPTED" && attempt.providerMessageId &&
      attempt.acceptedAt instanceof Date && Number.isFinite(attempt.acceptedAt.getTime())) {
    return { kind: "PROVIDER_ACCEPTED", acceptedAt: attempt.acceptedAt };
  }
  return { kind: "QUEUED" };
}
