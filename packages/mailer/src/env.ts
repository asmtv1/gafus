/**
 * Настройки SMTP из process.env (сервер только).
 */

export interface MailerEnv {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPass?: string;
  /** Адрес From (email), домен должен входить в ALLOWED_SENDER_DOMAINS у Postfix */
  mailFrom: string;
  /** Имя отправителя в заголовке From (опционально) */
  mailFromName?: string;
}

function parsePort(raw: string | undefined, fallback: number): number {
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : fallback;
}

/**
 * Читает переменные окружения для nodemailer → Postfix (или внешний SMTP).
 */
export function mailerEnvFromProcess(): MailerEnv {
  return {
    smtpHost: process.env.SMTP_HOST?.trim() ?? "",
    smtpPort: parsePort(process.env.SMTP_PORT, 587),
    smtpSecure: process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1",
    smtpUser: process.env.SMTP_USER?.trim() || undefined,
    smtpPass: process.env.SMTP_PASS?.trim() || undefined,
    mailFrom: process.env.MAIL_FROM?.trim() ?? "",
    mailFromName: process.env.MAIL_FROM_NAME?.trim() || undefined,
  };
}

/**
 * true, если можно вызывать sendTransactionalMail (есть хост и адрес отправителя).
 */
export function isMailerConfigured(env: MailerEnv = mailerEnvFromProcess()): boolean {
  return Boolean(env.smtpHost && env.mailFrom);
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
