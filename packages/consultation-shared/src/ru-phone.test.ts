import { describe, expect, it } from "vitest";

import {
  formatRuPhoneForDisplay,
  isLikelyValidRuPhoneInput,
  normalizeRuPhoneForStorage,
} from "./ru-phone";

describe("ru-phone", () => {
  it("нормализует валидный номер в E.164", () => {
    const normalized = normalizeRuPhoneForStorage("+7 999 123-45-67");
    expect(normalized).toBe("+79991234567");
  });

  it("возвращает null для невалидного номера", () => {
    expect(normalizeRuPhoneForStorage("123")).toBeNull();
    expect(isLikelyValidRuPhoneInput("123")).toBe(false);
  });

  it("форматирует номер для отображения", () => {
    const display = formatRuPhoneForDisplay("+79991234567");
    expect(display).toContain("+7");
  });
});
