import { sendResendMail } from "./resend.js";
import nodemailer from "nodemailer";
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
    attachments: input.attachments,
  });
}
