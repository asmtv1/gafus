/**
 * Настройки SMTP из process.env (сервер только).
 */

export interface MailerEnv {
  provider?: "smtp" | "resend";
  resendApiKey?: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPass?: string;
  /** Адрес From (email), домен должен быть разрешён в SMTP-провайдере */
  mailFrom: string;
  /** Имя отправителя в заголовке From (опционально) */
  mailFromName?: string;
  mailReplyTo?: string;
}

function parsePort(raw: string | undefined, fallback: number): number {
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : fallback;
}

/**
 * Читает переменные окружения для nodemailer и совместимого SMTP.
 */
export function mailerEnvFromProcess(): MailerEnv {
  const provider = process.env.MAIL_PROVIDER?.trim() || (process.env.RESEND_API_KEY?.trim() ? "resend" : "smtp");
  if (provider !== "smtp" && provider !== "resend") throw new Error("Unknown MAIL_PROVIDER");
  return {
    provider,
    resendApiKey: process.env.RESEND_API_KEY?.trim() || undefined,
    smtpHost: process.env.SMTP_HOST?.trim() ?? "",
    smtpPort: parsePort(process.env.SMTP_PORT, 587),
    smtpSecure: process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1",
    smtpUser: process.env.SMTP_USER?.trim() || undefined,
    smtpPass: process.env.SMTP_PASS?.trim() || undefined,
    mailFrom: provider === "resend"
      ? process.env.RESEND_FROM?.trim() || "notifications@notify.gafus.ru"
      : process.env.MAIL_FROM?.trim() ?? "",
    mailFromName: process.env.MAIL_FROM_NAME?.trim() || "Гафус",
    mailReplyTo: process.env.MAIL_REPLY_TO?.trim() || undefined,
  };
}

/**
 * true, если можно вызывать sendTransactionalMail (есть хост и адрес отправителя).
 */
export function isMailerConfigured(env: MailerEnv = mailerEnvFromProcess()): boolean {
  return Boolean(env.mailFrom && (env.provider === "resend" ? env.resendApiKey : env.smtpHost));
}

/**
 * Значение заголовка From для nodemailer.
 */
export function formatMailFromHeader(env: MailerEnv): string {
  if (env.mailFromName) {
    return `${env.mailFromName} <${env.mailFrom}>`;
  }
  return env.mailFrom;
}
