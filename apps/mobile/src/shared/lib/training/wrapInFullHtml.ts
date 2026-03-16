const GUIDE_READY_MSG = "gafus:guide-ready";

/**
 * Скрипт для WebView: после load + fonts.ready отправляет postMessage в React Native.
 * Поведение как на web (GuideContentEmbed) — спиннер до полной загрузки шрифтов.
 */
const READY_SCRIPT = `
(function() {
  function report() {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "${GUIDE_READY_MSG}" }));
    }
  }
  if (document.readyState === "complete") {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(report);
    } else {
      report();
    }
  } else {
    window.addEventListener("load", function() {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(report);
      } else {
        report();
      }
    });
  }
})();
`;

/**
 * Оборачивает HTML-фрагмент в полный документ, если он не содержит DOCTYPE.
 */
export function wrapInFullHtml(content: string): string {
  if (/<!DOCTYPE/i.test(content)) return content;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body>${content}</body></html>`;
}

/**
 * wrapInFullHtml + инжект скрипта готовности (load + fonts.ready).
 * Для мини-гайдов: onMessage в WebView получает { type: "gafus:guide-ready" }.
 */
export function wrapInFullHtmlWithReadySignal(content: string): string {
  const full = wrapInFullHtml(content);
  const closeBody = full.lastIndexOf("</body>");
  if (closeBody !== -1) {
    return full.slice(0, closeBody) + `<script>${READY_SCRIPT}<\\/script>` + full.slice(closeBody);
  }
  return full + `<script>${READY_SCRIPT}<\\/script>`;
}
