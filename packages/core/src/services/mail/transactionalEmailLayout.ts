/**
 * Общая вёрстка транзакционных писем (как «Подтвердите email», сброс пароля).
 * Используется в auth и в письмах консультаций.
 */
import { readFile } from "node:fs/promises";

import type { Attachment } from "@gafus/mailer";
import { sendTransactionalMail } from "@gafus/mailer";
import { createWebLogger } from "@gafus/logger";

import { getPublicWebBaseUrl } from "./publicWebBaseUrl";

const logger = createWebLogger("transactional-email-layout");

/** Один Content-ID на всё письмо (inline-вложение). */
export const TRANSACTIONAL_LOGO_CID = "gafus-logo@transactional";

let cachedLogoBuffer: Buffer | undefined;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function transactionalLogoAbsoluteUrl(): string {
  return `${getPublicWebBaseUrl()}/uploads/logo.png`;
}

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

function brandTextHeaderHtml(): string {
  return `<p style="margin:0 0 12px;font-size:22px;font-weight:700;color:#636128;letter-spacing:0.04em;font-family:Georgia,'Times New Roman',serif;">Гафус</p>`;
}

export function paragraphHtml(text: string): string {
  return `<p style="margin:0 0 16px 0;color:#333333;">${escapeHtml(text)}</p>`;
}

export function ctaButtonHtml(href: string, label: string): string {
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

export function plainLinkFallbackHtml(url: string): string {
  return `<p style="margin:24px 0 0 0;font-size:13px;color:#666666;">Если кнопка не нажимается, скопируйте ссылку в адресную строку браузера:</p>
<p style="margin:8px 0 0 0;font-size:12px;word-break:break-all;font-family:monospace;color:#1a56db;">${escapeHtml(
    url,
  )}</p>`;
}

interface WrapTransactionalEmailOptions {
  blocksHtml: string[];
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

export async function sendTransactionalEmailWithLayout(input: {
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
