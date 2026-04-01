/**
 * HTML статьи + высота WebView.
 * Высоту шлём через injectedJavaScript в WebView (см. ARTICLE_WEBVIEW_HEIGHT_INJECTED_JS):
 * скрипт внутри HTML ломается контентом (`</script>`, лишний `</body>`) и не срабатывает;
 * плюс injected выполняется после load — обработчик `load` в таком скрипте никогда не вызовется.
 */

export const ARTICLE_HEIGHT_MSG = "gafus:article-height";
export const ARTICLE_READY_MSG = "gafus:article-ready";

/**
 * Выполняется React Native WebView после загрузки документа: сразу замеряет scrollHeight
 * и при `complete` дублирует отложенные замеры (шрифты, картинки).
 */
export const ARTICLE_WEBVIEW_HEIGHT_INJECTED_JS = `
(function() {
  var HEIGHT = "${ARTICLE_HEIGHT_MSG}";
  var READY = "${ARTICLE_READY_MSG}";
  function contentHeight() {
    var a = document.documentElement.scrollHeight;
    var b = document.body ? document.body.scrollHeight : 0;
    return Math.max(a, b, 0);
  }
  function reportHeight() {
    var h = contentHeight();
    if (h > 0 && window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: HEIGHT, height: h }));
    }
  }
  function signalReady() {
    if (!window.ReactNativeWebView) return;
    reportHeight();
    var h = contentHeight();
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: READY, height: h }));
  }
  function afterLoad() {
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
  }
  reportHeight();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", reportHeight);
  }
  if (document.readyState === "complete") {
    afterLoad();
  } else {
    window.addEventListener("load", afterLoad);
  }
})();
true;
`;

/** Сброс отступов документа — иначе scrollHeight и WebView дают лишний «хвост» под контентом. */
const ARTICLE_HOST_RESET_STYLE =
  "<style>html,body{margin:0;padding:0;}body{padding-bottom:0!important}</style>";

/** Оборачивает фрагмент в полный документ, если нет DOCTYPE */
function wrapInFullHtml(content: string): string {
  if (/<!DOCTYPE/i.test(content)) return content;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${ARTICLE_HOST_RESET_STYLE}</head><body>${content}</body></html>`;
}

/** Полный HTML документа; postMessage высоты — только через ARTICLE_WEBVIEW_HEIGHT_INJECTED_JS. */
export function wrapArticleHtml(htmlFragment: string): string {
  return wrapInFullHtml(htmlFragment);
}
