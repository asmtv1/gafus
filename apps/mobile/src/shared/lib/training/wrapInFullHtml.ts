/**
 * Оборачивает HTML-фрагмент в полный документ, если он не содержит DOCTYPE.
 */
export function wrapInFullHtml(content: string): string {
  if (/<!DOCTYPE/i.test(content)) return content;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body>${content}</body></html>`;
}
