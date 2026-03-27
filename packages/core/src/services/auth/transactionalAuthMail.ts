/**
 * Транзакционные письма для сценариев аккаунта (через Postfix / @gafus/mailer).
 *
 * Доставляемость (спам / «нет доверия» у Mail.ru и др.):
 * — Настраивается на стороне DNS и почтового сервера: PTR для IP отправителя, SPF, DKIM,
 *   DMARC для домена в MAIL_FROM. Без этого клиенты режут ссылки и картинки даже при
 *   корректной вёрстке.
 * — Вёрстка: multipart text+html, «bulletproof» CTA (таблица + padding на &lt;a&gt;, VML для
 *   Outlook), логотип по возможности inline (cid), чтобы клиент не ходил за картинкой по URL.
 *
 * См. обзоры: Litmus (bulletproof buttons), Twilio/SendGrid (CID vs linked images).
 * В репозитории .cursor/skills отдельного skill про email нет — ориентиры выше.
 */

import { readFile } from "node:fs/promises";

import type { Attachment } from "@gafus/mailer";
import { isMailerConfigured, sendTransactionalMail } from "@gafus/mailer";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("transactional-auth-mail");

/** Один Content-ID на всё письмо (inline-вложение). */
const TRANSACTIONAL_LOGO_CID = "gafus-logo@transactional";

let cachedLogoBuffer: Buffer | undefined;

/** Публичный URL сайта (ссылки в письмах и запасной URL логотипа). */
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
  try {
    await sendTransactionalLayout({
      to,
      subject,
      text,
      blocksHtml: [
        paragraphHtml("Здравствуйте!"),
        paragraphHtml(
          "Вы получили это письмо, потому что для вашего аккаунта запрошено восстановление пароля.",
        ),
        paragraphHtml(
          "Нажмите кнопку ниже, чтобы задать новый пароль. Ссылка действует ограниченное время.",
        ),
        ctaButtonHtml(resetUrl, "Сбросить пароль"),
        paragraphHtml(
          "Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо — пароль не изменится.",
        ),
        plainLinkFallbackHtml(resetUrl),
      ],
    });
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
    await sendTransactionalLayout({
      to,
      subject,
      text,
      blocksHtml: [
        paragraphHtml("Здравствуйте!"),
        paragraphHtml("Пароль вашего аккаунта был изменён."),
        paragraphHtml("Если это были не вы — срочно свяжитесь с поддержкой."),
      ],
    });
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
    await sendTransactionalLayout({
      to,
      subject,
      text,
      blocksHtml: [
        paragraphHtml("Здравствуйте!"),
        paragraphHtml(`Ваш логин для входа изменён на: ${newUsername}`),
        paragraphHtml("Если это были не вы — свяжитесь с поддержкой."),
      ],
    });
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
  try {
    await sendTransactionalLayout({
      to,
      subject,
      text,
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
  try {
    await sendTransactionalLayout({
      to,
      subject,
      text,
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

function transactionalLogoAbsoluteUrl(): string {
  return `${getPublicWebBaseUrl()}/uploads/logo.png`;
}

/**
 * Inline-логотип: путь на диске (prod) или один раз загрузить с публичного URL (кэш в памяти).
 */
async function resolveInlineLogoAttachment(): Promise<Attachment | undefined> {
  const pathEnv = process.env.TRANSACTIONAL_EMAIL_LOGO_PATH?.trim();
  if (pathEnv) {
    try {
      const content = await readFile(pathEnv);
      if (content.length < 32) return undefined;
      return {
        filename: "logo.png",
        content,
        cid: TRANSACTIONAL_LOGO_CID,
        contentDisposition: "inline",
      };
    } catch (e) {
      logger.warn("Не прочитан TRANSACTIONAL_EMAIL_LOGO_PATH", {
        path: pathEnv,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (cachedLogoBuffer) {
    return {
      filename: "logo.png",
      content: cachedLogoBuffer,
      cid: TRANSACTIONAL_LOGO_CID,
      contentDisposition: "inline",
    };
  }

  try {
    const url = transactionalLogoAbsoluteUrl();
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: "image/png,image/webp,image/*;q=0.8",
        "User-Agent": "Gafus-TransactionalMail/1.0",
      },
    });
    if (!res.ok) {
      logger.warn("Загрузка логотипа для письма: HTTP ошибка", { status: res.status, url });
      return undefined;
    }
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.includes("image")) {
      logger.warn("Загрузка логотипа: ответ не image/*", { contentType: ct, url });
      return undefined;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32) return undefined;
    cachedLogoBuffer = buf;
    return {
      filename: "logo.png",
      content: buf,
      cid: TRANSACTIONAL_LOGO_CID,
      contentDisposition: "inline",
    };
  } catch (e) {
    logger.warn("Загрузка логотипа для письма не удалась", {
      error: e instanceof Error ? e.message : String(e),
    });
    return undefined;
  }
}

/** Текстовый бренд всегда: при блокировке картинок остаётся узнаваемый заголовок. */
function brandTextHeaderHtml(): string {
  return `<p style="margin:0 0 12px;font-size:22px;font-weight:700;color:#636128;letter-spacing:0.04em;font-family:Georgia,'Times New Roman',serif;">Гафус</p>`;
}

function paragraphHtml(text: string): string {
  return `<p style="margin:0 0 16px 0;color:#333333;">${escapeHtml(text)}</p>`;
}

/**
 * Гибридная кнопка: VML (Outlook) + таблица с padding на ссылке (остальные клиенты).
 * См. Litmus / ActiveCampaign — «bulletproof buttons».
 */
function ctaButtonHtml(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `<!--[if mso]>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;"><tr><td>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:48px;v-text-anchor:middle;" arcsize="12%" stroke="f" fillcolor="#636128">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;line-height:48px;mso-line-height-rule:exactly;">${safeLabel}</center>
</v:roundrect>
</td></tr></table>
<![endif]-->
<!--[if !mso]><!-- -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;">
<tr>
<td bgcolor="#636128" style="background-color:#636128;border-radius:10px;">
<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;font-weight:600;color:#ffffff !important;text-decoration:none;border-radius:10px;line-height:1.2;">${safeLabel}</a>
</td>
</tr>
</table>
<!--<![endif]-->`;
}

function plainLinkFallbackHtml(url: string): string {
  return `<p style="margin:24px 0 0 0;font-size:13px;color:#666666;">Если кнопка не нажимается, скопируйте ссылку в адресную строку браузера:</p>
<p style="margin:8px 0 0 0;font-size:12px;word-break:break-all;font-family:monospace;color:#1a56db;">${escapeHtml(
    url,
  )}</p>`;
}

interface WrapTransactionalEmailOptions {
  blocksHtml: string[];
  /** cid — есть inline-вложение; none — только текстовый бренд (без внешней картинки). */
  logoMode: "cid" | "none";
}

function wrapTransactionalEmailHtml({ blocksHtml, logoMode }: WrapTransactionalEmailOptions): string {
  const inner = blocksHtml.join("\n");
  const logoBlock =
    logoMode === "cid"
      ? `${brandTextHeaderHtml()}<img src="cid:${TRANSACTIONAL_LOGO_CID}" width="100" alt="Гафус" style="display:block;width:100px;max-width:100%;height:auto;margin:0;border:0;" />`
      : brandTextHeaderHtml();

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:24px 12px;background-color:#f5f0e8;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:28px 24px 8px 24px;">
        ${logoBlock}
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

async function sendTransactionalLayout(input: {
  to: string | string[];
  subject: string;
  text: string;
  blocksHtml: string[];
}): Promise<void> {
  const logoAtt = await resolveInlineLogoAttachment();
  const logoMode: WrapTransactionalEmailOptions["logoMode"] = logoAtt ? "cid" : "none";
  const html = wrapTransactionalEmailHtml({
    blocksHtml: input.blocksHtml,
    logoMode,
  });

  await sendTransactionalMail({
    to: input.to,
    subject: input.subject,
    text: input.text,
    html,
    attachments: logoAtt ? [logoAtt] : undefined,
  });
}
