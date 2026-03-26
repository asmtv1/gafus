/**
 * Транзакционные письма для сценариев аккаунта (через Postfix / @gafus/mailer).
 */

import { isMailerConfigured, sendTransactionalMail } from "@gafus/mailer";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("transactional-auth-mail");

/** Публичный URL сайта (ссылки в письмах). */
export function getPublicWebBaseUrl(): string {
  const raw = process.env.WEB_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://gafus.ru";
  return raw.replace(/\/$/, "");
}

export function assertMailerReady(): void {
  if (!isMailerConfigured()) {
    throw new Error("Отправка писем не настроена (SMTP). Обратитесь в поддержку.");
  }
}

export async function sendPasswordResetLinkEmail(to: string, resetUrl: string): Promise<void> {
  assertMailerReady();
  const subject = "Восстановление пароля — Гафус";
  const text = [
    "Здравствуйте!",
    "",
    "Вы получили это письмо, потому что для аккаунта Гафус запрошено восстановление пароля.",
    "Чтобы задать новый пароль, откройте ссылку в браузере (она действует ограниченное время):",
    resetUrl,
    "",
    "Если вы не запрашивали сброс — ничего не делайте, пароль останется прежним.",
    "",
    "С уважением,",
    "команда Гафус",
  ].join("\n");
  const html = wrapTransactionalEmailHtml({
    blocksHtml: [
      paragraphHtml("Здравствуйте!"),
      paragraphHtml(
        "Вы получили это письмо, потому что для вашего аккаунта запрошено восстановление пароля.",
      ),
      paragraphHtml("Нажмите кнопку ниже, чтобы задать новый пароль. Ссылка действует ограниченное время."),
      ctaButtonHtml(resetUrl, "Сбросить пароль"),
      paragraphHtml(
        "Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо — пароль не изменится.",
      ),
      plainLinkFallbackHtml(resetUrl),
    ],
  });
  try {
    await sendTransactionalMail({ to, subject, text, html });
  } catch (error) {
    logger.error(
      "Не удалось отправить письмо сброса пароля",
      error instanceof Error ? error : new Error(String(error)),
      {},
    );
    throw new Error("Не удалось отправить письмо. Попробуйте позже.");
  }
}

export async function sendPasswordChangedNoticeEmail(to: string): Promise<void> {
  if (!isMailerConfigured()) return;
  const subject = "Пароль изменён — Гафус";
  const text = [
    "Здравствуйте!",
    "",
    "Пароль вашего аккаунта был изменён.",
    "Если это были не вы — срочно свяжитесь с поддержкой.",
    "",
    "— Команда Гафус",
  ].join("\n");
  try {
    await sendTransactionalMail({ to, subject, text });
  } catch (error) {
    logger.error(
      "Не удалось отправить уведомление о смене пароля",
      error instanceof Error ? error : new Error(String(error)),
      {},
    );
  }
}

export async function sendUsernameChangedNoticeEmail(to: string, newUsername: string): Promise<void> {
  if (!isMailerConfigured()) return;
  const subject = "Логин изменён — Гафус";
  const text = [
    "Здравствуйте!",
    "",
    `Ваш логин для входа изменён на: ${newUsername}`,
    "Если это были не вы — свяжитесь с поддержкой.",
    "",
    "— Команда Гафус",
  ].join("\n");
  try {
    await sendTransactionalMail({ to, subject, text });
  } catch (error) {
    logger.error(
      "Не удалось отправить уведомление о смене логина",
      error instanceof Error ? error : new Error(String(error)),
      {},
    );
  }
}

export async function sendAccountDeletionCodeEmail(to: string, code: string): Promise<void> {
  assertMailerReady();
  const subject = "Код подтверждения удаления аккаунта — Гафус";
  const text = [
    "Здравствуйте!",
    "",
    `Код для подтверждения удаления аккаунта: ${code}`,
    "Код действует 15 минут. Если вы не запрашивали удаление — срочно смените пароль и свяжитесь с поддержкой.",
    "",
    "— Команда Гафус",
  ].join("\n");
  const html = wrapTransactionalEmailHtml({
    blocksHtml: [
      paragraphHtml("Здравствуйте!"),
      paragraphHtml("Код для подтверждения удаления аккаунта:"),
      `<p style="margin:16px 0;font-size:24px;font-weight:700;letter-spacing:0.2em;font-family:monospace;">${escapeHtml(
        code,
      )}</p>`,
      paragraphHtml(
        "Код действует 15 минут. Если вы не запрашивали удаление — срочно смените пароль и свяжитесь с поддержкой.",
      ),
    ],
  });
  try {
    await sendTransactionalMail({ to, subject, text, html });
  } catch (error) {
    logger.error(
      "Не удалось отправить код удаления аккаунта",
      error instanceof Error ? error : new Error(String(error)),
      {},
    );
    throw new Error("Не удалось отправить письмо. Попробуйте позже.");
  }
}

export async function sendEmailChangeConfirmEmail(to: string, confirmUrl: string): Promise<void> {
  assertMailerReady();
  const subject = "Подтвердите новый email — Гафус";
  const text = [
    "Здравствуйте!",
    "",
    "Кто-то указал этот адрес email как новый для аккаунта в сервисе «Гафус».",
    "Чтобы подтвердить смену, откройте ссылку в браузере (она действует ограниченное время):",
    confirmUrl,
    "",
    "Если вы не меняли email в Гафус или не создавали аккаунт — ничего не делайте: адрес не будет привязан.",
    "",
    "С уважением,",
    "команда Гафус",
  ].join("\n");
  const html = wrapTransactionalEmailHtml({
    blocksHtml: [
      paragraphHtml("Здравствуйте!"),
      paragraphHtml(
        "Вы получили это письмо, потому что для аккаунта «Гафус» запрошена привязка этого email.",
      ),
      paragraphHtml(
        "Нажмите кнопку ниже, чтобы подтвердить новый адрес. Ссылка одноразовая и действует ограниченное время.",
      ),
      ctaButtonHtml(confirmUrl, "Подтвердить email"),
      paragraphHtml(
        "Если вы не запрашивали смену email или это письмо пришло по ошибке — просто удалите его: никаких изменений в аккаунте не произойдёт.",
      ),
      plainLinkFallbackHtml(confirmUrl),
    ],
  });
  try {
    await sendTransactionalMail({ to, subject, text, html });
  } catch (error) {
    logger.error(
      "Не удалось отправить письмо подтверждения email",
      error instanceof Error ? error : new Error(String(error)),
      {},
    );
    throw new Error("Не удалось отправить письмо. Попробуйте позже.");
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Абсолютный URL логотипа для писем (клиенты не грузят относительные пути). */
function transactionalLogoAbsoluteUrl(): string {
  return `${getPublicWebBaseUrl()}/uploads/logo.png`;
}

function paragraphHtml(text: string): string {
  return `<p style="margin:0 0 16px 0;color:#333333;">${escapeHtml(text)}</p>`;
}

/**
 * Кнопка-ссылка в виде таблицы — лучше отображается в почтовых клиентах, чем голый &lt;a&gt;.
 */
function ctaButtonHtml(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;">
  <tr>
    <td style="border-radius:10px;background-color:#636128;">
      <a href="${safeHref}" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;line-height:1.2;">${safeLabel}</a>
    </td>
  </tr>
</table>`;
}

function plainLinkFallbackHtml(url: string): string {
  return `<p style="margin:24px 0 0 0;font-size:13px;color:#666666;">Если кнопка не нажимается, скопируйте ссылку в адресную строку браузера:</p>
<p style="margin:8px 0 0 0;font-size:12px;word-break:break-all;font-family:monospace;color:#333333;">${escapeHtml(
    url,
  )}</p>`;
}

interface WrapTransactionalEmailOptions {
  blocksHtml: string[];
}

function wrapTransactionalEmailHtml({ blocksHtml }: WrapTransactionalEmailOptions): string {
  const logoSrc = escapeHtml(transactionalLogoAbsoluteUrl());
  const inner = blocksHtml.join("\n");
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:24px 12px;background-color:#f5f0e8;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:28px 24px 8px 24px;">
        <img src="${logoSrc}" width="100" alt="Гафус" style="display:block;width:100px;height:auto;margin:0;border:0;line-height:0;" />
      </td>
    </tr>
    <tr>
      <td style="padding:8px 24px 28px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.55;color:#333333;">
        ${inner}
        <p style="margin:28px 0 0 0;font-size:14px;color:#666666;">С уважением,<br />команда Гафус</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
