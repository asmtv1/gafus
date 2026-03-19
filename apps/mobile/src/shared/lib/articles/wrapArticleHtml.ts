/**
 * Оборачивает HTML-контент статьи как мини-гайды в курсах (wrapInFullHtmlWithReadySignal).
 * Контент передаётся как есть, без инжекта стилей — HTML содержит собственные стили.
 * Скрипт инжектируется перед </body> для postMessage высоты (load + fonts.ready).
 */

export const ARTICLE_HEIGHT_MSG = "gafus:article-height";
export const ARTICLE_READY_MSG = "gafus:article-ready";

/** Скрипт: ready после load+fonts, height — многократно для отложенных замеров */
const HEIGHT_SCRIPT = `
(function() {
  function reportHeight() {
    var h = document.documentElement.scrollHeight;
    if (h > 0 && window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "${ARTICLE_HEIGHT_MSG}", height: h }));
    }
  }
  function signalReady() {
    if (window.ReactNativeWebView) {
      reportHeight();
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "${ARTICLE_READY_MSG}", height: document.documentElement.scrollHeight }));
    }
  }
  reportHeight();
  document.addEventListener("DOMContentLoaded", reportHeight);
  window.addEventListener("load", function() {
    reportHeight();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function() {
        requestAnimationFrame(function() {
          requestAnimationFrame(function() { setTimeout(signalReady, 80); });
        });
      });
    } else {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() { setTimeout(signalReady, 80); });
      });
    }
    [500, 1000, 1500, 2500, 4000].forEach(function(ms) {
      setTimeout(reportHeight, ms);
    });
  });
})();
`;

/** Оборачивает фрагмент в полный документ, если нет DOCTYPE */
function wrapInFullHtml(content: string): string {
  if (/<!DOCTYPE/i.test(content)) return content;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body>${content}</body></html>`;
}

/**
 * wrapInFullHtml + инжект скрипта высоты перед </body>.
 * Для полных документов — инжект в существующий </body>, для фрагментов — в обёртку.
 */
export function wrapArticleHtml(htmlFragment: string): string {
  const full = wrapInFullHtml(htmlFragment);
  const closeBody = full.lastIndexOf("</body>");
  const script = `<script>${HEIGHT_SCRIPT}<\\/script>`;
  if (closeBody !== -1) {
    return full.slice(0, closeBody) + script + full.slice(closeBody);
  }
  return full + script;
}
