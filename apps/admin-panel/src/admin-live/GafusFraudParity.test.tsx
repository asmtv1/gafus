import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GafusPanel } from "./GafusPanel";

const signals = ["signal-one", "signal-two"].map((id) => ({
  id, kind: "DUPLICATE_REACTION", severity: "HIGH", createdAt: "2026-10-25T09:00:00Z",
  userId: "test-user", entityType: "POST", entityId: "test-post",
}));

describe("admin Gafus fraud: one form per signal as in Next", () => {
  it("renders separate review reasons and reversal amounts for each signal", () => {
    const html = renderToStaticMarkup(createElement(GafusPanel, {
      source: signals, tab: "fraud", onSaved: vi.fn(),
    }));
    expect(html).toContain('aria-label="Результат проверки signal-one"');
    expect(html).toContain('aria-label="Результат проверки signal-two"');
    expect(html).toContain('aria-label="Списание signal-one"');
    expect(html).toContain('aria-label="Списание signal-two"');
    expect(html.match(/<textarea/g)).toHaveLength(2);
    expect(html.match(/type="number"/g)).toHaveLength(2);
    expect(html.match(/Подтвердить нарушение/g)).toHaveLength(2);
  });
  it("shows empty state rather than a shared active review form", () => {
    const html = renderToStaticMarkup(createElement(GafusPanel, {
      source: [], tab: "fraud", onSaved: vi.fn(),
    }));
    expect(html).toContain("Открытых сигналов нет");
    expect(html).not.toContain("<textarea");
  });
});
