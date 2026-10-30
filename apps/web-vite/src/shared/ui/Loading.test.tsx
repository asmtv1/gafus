import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Loading } from "./Loading";

describe("Web shared dog loading state", () => {
  it("renders the Mobile mascot's local poster and animated image with a visible status label", () => {
    const html = renderToStaticMarkup(<Loading message="Загружаем курсы…" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('data-gafus-loader="inline"');
    expect(html).toContain("loading-mascot-router-poster.webp");
    expect(html).toContain("loading-mascot-router.webp");
    expect(html).toContain("Загружаем курсы…");
    expect(html).toContain('width="168"');
  });

  it("supports card, screen and compact without changing the asset", () => {
    for (const variant of ["card", "screen", "compact", "icon"] as const) {
      const html = renderToStaticMarkup(<Loading variant={variant} />);
      expect(html).toContain('data-gafus-loader="' + variant + '"');
      expect(html).toContain("Загружаем…");
    }
  });
});
