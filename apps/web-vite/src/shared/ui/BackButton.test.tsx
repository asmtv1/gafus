import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BackButton, BackButtonLink } from "./BackButton";

describe("shared Back button", () => {
  it("renders a native button with the single shared design, label and SVG icon", () => {
    const html = renderToStaticMarkup(<BackButton disabled>Назад</BackButton>);
    expect(html).toContain("<button");
    expect(html).toContain("type=\"button\"");
    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("data-gafus-shared-button=\"back\"");
    expect(html).toContain("<svg");
    expect(html).toContain("aria-hidden=\"true\"");
    expect(html).toContain("Назад");
  });

  it("supports explicit submit type and the same shared styling", () => {
    const html = renderToStaticMarkup(<BackButton type="submit">Применить</BackButton>);
    expect(html).toContain("type=\"submit\"");
    expect(html).toContain("data-gafus-shared-button=\"back\"");
  });

  it("renders destination as a native SPA anchor with the same back skin", () => {
    const html = renderToStaticMarkup(<BackButtonLink to="/questions">Все вопросы</BackButtonLink>);
    expect(html).toContain("<a ");
    expect(html).toContain("href=\"/questions\"");
    expect(html).toContain("data-gafus-shared-button=\"back\"");
    expect(html).toContain("<svg");
    expect(html).toContain("Все вопросы");
    expect(html).not.toContain("← Все вопросы");
  });
});
