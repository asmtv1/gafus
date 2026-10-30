import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { profitPartnersFromReport, profitTodayFromReport } from "./profitPartners";
import { ProfitExpenses } from "./ProfitExpenses";
import { ProfitVideoEditor } from "./ProfitVideoEditor";

const report = {
  today: "2026-10-25",
  partners: [
    { id: "p-one", name: "Креатор Один", active: true },
    { id: "p-two", name: "Креатор Два", active: false },
  ],
};

describe("profit creator parity with Next", () => {
  it("only accepts real typed creator options from the financial API", () => {
    expect(profitPartnersFromReport(report)).toEqual(report.partners);
    expect(profitPartnersFromReport({ partners: [{ id: "../api", name: "Unsafe", active: true }] })).toBeNull();
    expect(profitPartnersFromReport({ partners: [{ id: "p", name: "Broken", active: "yes" }] })).toBeNull();
    expect(profitPartnersFromReport({ partners: null })).toBeNull();
  });

  it("accepts only valid report dates as the allowed expense ceiling", () => {
    expect(profitTodayFromReport(report)).toBe("2026-10-25");
    expect(profitTodayFromReport({ today: "2026-09-31" })).toBeNull();
    expect(profitTodayFromReport({ today: "2026-08-31" })).toBeNull();
  });

  it("presents create creator selection with inactive creator label, not editable IDs", () => {
    const html = renderToStaticMarkup(
      createElement(ProfitExpenses, { source: report, onSaved: vi.fn() }),
    );
    expect(html).toContain('value="p-one"');
    expect(html).toContain('value="p-two"');
    expect(html).toContain("Креатор Два (неактивен)");
    expect(html).not.toContain("ID партнёра");
    expect(html).toContain("Выберите креатора");
    expect(html).toContain('min="2026-09-01"');
    expect(html).toContain('max="2026-10-25"');
  });

  it("disables new expenses if the API did not return the creator list", () => {
    const html = renderToStaticMarkup(
      createElement(ProfitExpenses, { source: {}, onSaved: vi.fn() }),
    );
    expect(html).toContain("Не удалось загрузить список креаторов");
    expect(html).toMatch(/<button disabled="" type="submit">Записать расход<\/button>/);
  });

  it("edits with the same creator options and preserves historical deleted choices", () => {
    const html = renderToStaticMarkup(createElement(ProfitVideoEditor, {
      row: { id: "e1", version: 2, partnerId: "old-p", partnerName: "Старый", paidDay: "2026-10-01", quantity: 1, comment: null, canceled: false },
      partners: report.partners,
      today: report.today,
      onSaved: vi.fn(),
      onClose: vi.fn(),
    }));
    expect(html).toContain('value="old-p"');
    expect(html).toContain("Старый (текущий)");
    expect(html).toContain("Креатор Один");
    expect(html).toContain("Креатор Два (неактивен)");
    expect(html).not.toContain("ID партнёра");
  });
});
