import { describe, expect, it } from "vitest";

import { cynologistDisplayInitials, plainConsultationAboutHtml } from "./consultationCatalogPresentation";

describe("plainConsultationAboutHtml", () => {
  it("удаляет теги и управляющие символы", () => {
    expect(plainConsultationAboutHtml('<p>Текст</p>\u0000')).toBe("Текст");
  });

  it("ограничивает длину", () => {
    const long = `a`.repeat(25_000);
    expect(plainConsultationAboutHtml(long).length).toBeLessThanOrEqual(20_000);
  });
});

describe("cynologistDisplayInitials", () => {
  it("две буквы из двух слов", () => {
    expect(cynologistDisplayInitials("Иван Петров")).toBe("ИП");
  });
});
