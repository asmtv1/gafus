import { describe, expect, it } from "vitest";
import { matchesCatalogSearch, normalizeCatalogText, sortCatalogRows, clampCatalogPage,
  catalogPlainPreview } from "./trainerCatalogSearch";
const rows = [
  { id: "1", title: "Старт", createdAt: "2026-01-01", updatedAt: "2026-01-01", count: 2 },
  { id: "2", title: "Финиш", createdAt: "2026-02-01", updatedAt: "2026-03-01", count: 4 },
];
describe("catalog search across complete authorized dataset", () => {
  it("normalizes accents, case, punctuation, nonbreaking spaces and yo/e", () => {
    expect(normalizeCatalogText("  ЁЖИК—СИДЕТЬ   «КО МНЕ»  ")).toBe("ежик сидеть ко мне");
    expect(matchesCatalogSearch("  Ежик сидеть  ", ["Ёжик — сидеть"])).toBe(true);
    expect(matchesCatalogSearch("КО МНЕ", ["Команда «ко мне»"])).toBe(true);
  });
  it("finds several words in any order and across related fields, but not unrelated text", () => {
    expect(matchesCatalogSearch("курс прогулка", ["Тренировка", "Прогулка", "Первый курс"])).toBe(true);
    expect(matchesCatalogSearch("собака 28", ["Собака", "День 28"])).toBe(true);
    expect(matchesCatalogSearch("неизвестно", ["Собака", "Курс"])).toBe(false);
  });
  it("makes readable short plain-text previews of Markdown without producing HTML", () => {
    expect(catalogPlainPreview("# Заголовок\n\n**Сидеть** и [упражнение](https://example.org)"))
      .toBe("Заголовок Сидеть и упражнение");
    expect(catalogPlainPreview("<script>alert(1)</script>"))
      .toBe("alert(1)");
  });
  it("sorts deterministically and clamps stale pagination after filtering", () => {
    expect(sortCatalogRows(rows, "newest", x => x.count).map(x=>x.id)).toEqual(["2","1"]);
    expect(sortCatalogRows(rows, "title", x => x.count).map(x=>x.id)).toEqual(["1","2"]);
    expect(sortCatalogRows(rows, "relations", x => x.count).map(x=>x.id)).toEqual(["2","1"]);
    expect(clampCatalogPage(999, 11, 10)).toBe(1);
    expect(clampCatalogPage(20, 0, 25)).toBe(0);
  });
});
