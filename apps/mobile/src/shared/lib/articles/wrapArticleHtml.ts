/**
 * Оборачивает HTML-контент статьи в полный документ с инжектом стилей (паритет с web markdownContent)
 * и скриптом для динамической высоты WebView (встроенный скролл без двойной прокрутки).
 */

export const ARTICLE_HEIGHT_MSG = "gafus:article-height";

const MARKDOWN_CONTENT_STYLES = `
  body { margin: 0; padding: 0; color: #352e2e; font-size: 16px; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
  .markdownContent p { margin-bottom: 1em; }
  .markdownContent ul, .markdownContent ol { padding-left: 1.5em; margin-bottom: 1em; }
  .markdownContent li { margin-bottom: 0.5em; }
  .markdownContent h1, .markdownContent h2, .markdownContent h3, .markdownContent h4, .markdownContent h5, .markdownContent h6 { margin-top: 1em; margin-bottom: 0.5em; font-weight: bold; }
  .markdownContent code { background-color: #f5f5f5; padding: 2px 4px; border-radius: 3px; font-family: monospace; }
  .markdownContent pre { background-color: #f5f5f5; padding: 1em; border-radius: 5px; overflow-x: auto; }
  .markdownContent blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding-left: 1em; color: #666; }
  .markdownContent table { border-collapse: collapse; margin: 1em 0; width: 100%; }
  .markdownContent th, .markdownContent td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  .markdownContent th { background-color: rgba(99, 97, 40, 0.12); font-weight: 600; }
  img { max-width: 100%; height: auto; }
`;

const HEIGHT_SCRIPT = `
(function() {
  function report() {
    var h = document.documentElement.scrollHeight;
    if (h > 0 && window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "${ARTICLE_HEIGHT_MSG}", height: h }));
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

function wrapInFullHtml(content: string): string {
  if (/<!DOCTYPE/i.test(content)) return content;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>${MARKDOWN_CONTENT_STYLES}</style></head><body><div class="markdownContent">${content}</div><script>${HEIGHT_SCRIPT}<\\/script></body></html>`;
}

export function wrapArticleHtml(htmlFragment: string): string {
  return wrapInFullHtml(htmlFragment);
}
