import { describe, expect, it } from "vitest";

import { transliterate } from "./transliterate";

describe("transliterate", () => {
  it("транслитерирует кириллицу в латиницу", () => {
    expect(transliterate("Иван")).toBe("ivan");
  });

  it("заменяет недопустимые символы на подчёркивание и схлопывает их", () => {
    expect(transliterate("user@name!!")).toBe("user_name");
  });

  it("убирает ведущие и хвостовые подчёркивания", () => {
    expect(transliterate("__test__")).toBe("test");
  });
});
