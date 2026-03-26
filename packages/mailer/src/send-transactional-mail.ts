import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

import {
  type MailerEnv,
  formatMailFromHeader,
  isMailerConfigured,
  mailerEnvFromProcess,
} from "./env.js";

export interface SendTransactionalMailInput {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

/**
 * Создаёт transporter для одной отправки или пула (без пула — вызывать из sendTransactionalMail).
 */
export function createMailerTransporter(env: MailerEnv = mailerEnvFromProcess()): Transporter {
  if (!isMailerConfigured(env)) {
    throw new Error("Почта не настроена: задайте SMTP_HOST и MAIL_FROM");
  }

  const hasAuth = Boolean(env.smtpUser && env.smtpPass);
  const port = env.smtpPort;
  // Внутренний Postfix (Docker): без auth, SMTP_SECURE=false — без STARTTLS, иначе Node падает на self-signed.
  // Внешний SMTP с логином — оставляем обычное поведение nodemailer (STARTTLS при поддержке сервером).
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
  const transporter = createMailerTransporter(env);
  const from = formatMailFromHeader(env);

  await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo,
  });
}
