import { describe, expect, it } from "vitest";
import { sanitizeArticleHtml } from "./sanitizeArticleHtml";

describe("article HTML boundary", () => {
  it("preserves article formatting and safe images", () => {
    expect(sanitizeArticleHtml('<h2>Команды</h2><p><strong>Рядом</strong></p><img src="https://cdn.test/dog.jpg" alt="Собака">'))
      .toContain('<img src="https://cdn.test/dog.jpg" alt="Собака" />');
  });
  it.each([
    '<img src="x" onerror="alert(1)"><script>alert(1)</script>',
    '<a href="java&#115;cript:alert(1)">link</a>',
    '<svg onload="alert(1)"><a href="javascript:alert(1)">x</a></svg>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<img src="data:image/svg+xml,bad"><p style="background:url(javascript:alert(1))">x</p>',
  ])("removes executable markup: %s", (html) => {
    expect(sanitizeArticleHtml(html)).not.toMatch(/onerror|onload|javascript:|<script|<iframe|<svg|srcdoc|data:|style=/i);
  });
});
