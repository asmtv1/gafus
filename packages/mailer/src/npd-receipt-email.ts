export interface NpdReceiptEmailData {
  serviceName: string;
  amountKopecks: number;
  operationAt: Date;
  printUrl: string;
}

export interface RenderedNpdReceiptEmail {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAmount(amountKopecks: number): string {
  return `${Math.floor(amountKopecks / 100)}.${String(amountKopecks % 100).padStart(2, "0")} ₽`;
}

function formatDate(date: Date): string {
  return `${new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date)} МСК`;
}

function ctaButtonHtml(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0"><tr><td bgcolor="#636128" style="border-radius:10px"><a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;font-size:16px;font-weight:600;color:#fff;text-decoration:none;border-radius:10px">${escapeHtml(label)}</a></td></tr></table>`;
}

export function renderNpdReceiptEmail(data: NpdReceiptEmailData): RenderedNpdReceiptEmail {
  const amount = formatAmount(data.amountKopecks);
  const date = formatDate(data.operationAt);
  const service = escapeHtml(data.serviceName);
  const amountHtml = escapeHtml(amount);
  const dateHtml = escapeHtml(date);
  const urlHtml = escapeHtml(data.printUrl);
  const text = [
    "Чек за подписку Gafus Premium",
    "",
    `Услуга: ${data.serviceName}`,
    `Сумма: ${amount}`,
    `Дата оплаты: ${date}`,
    "",
    "Открыть и распечатать чек:",
    data.printUrl,
    "",
    "Gafus: https://gafus.ru",
    "Поддержка: support@gafus.ru",
  ].join("\n");
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Чек за подписку Gafus Premium</title></head><body style="margin:0;padding:24px 12px;background:#f5f0e8"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:auto;background:#fff;border-radius:12px"><tr><td style="padding:28px 24px 8px;font:700 22px Georgia,serif;color:#636128">Gafus</td></tr><tr><td style="padding:8px 24px 28px;font:16px/1.55 Arial,sans-serif;color:#333"><h1 style="font-size:24px;line-height:1.25">Чек за подписку Gafus Premium</h1><p>Спасибо за оплату. Чек сформирован и доступен по ссылке.</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:16px 0"><tr><td style="padding:8px 12px 8px 0"><strong>Услуга</strong></td><td>${service}</td></tr><tr><td style="padding:8px 12px 8px 0"><strong>Сумма</strong></td><td>${amountHtml}</td></tr><tr><td style="padding:8px 12px 8px 0"><strong>Дата оплаты</strong></td><td>${dateHtml}</td></tr></table>${ctaButtonHtml(data.printUrl, "Открыть чек")}
<p style="font-size:12px;word-break:break-all;color:#666">Если кнопка не работает, скопируйте ссылку:<br>${urlHtml}</p><p style="margin-top:28px;font-size:14px;color:#666">Gafus: <a href="https://gafus.ru">gafus.ru</a><br>Поддержка: <a href="mailto:support@gafus.ru">support@gafus.ru</a></p></td></tr></table></body></html>`;
  return { subject: "Чек за подписку Gafus Premium", text, html };
}
