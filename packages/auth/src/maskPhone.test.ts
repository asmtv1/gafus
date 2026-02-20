import { describe, expect, it } from "vitest";

import { maskPhone } from "./maskPhone";

describe("maskPhone", () => {
  it("маскирует +79001234567 → +7 *** *** *** 67", () => {
    expect(maskPhone("+79001234567")).toBe("+7 *** *** *** 67");
  });

  it("2 цифры — возвращает tail (оба знака)", () => {
    expect(maskPhone("12")).toBe("12");
  });

  it("4 цифры — tail 2, остальное звёздочки", () => {
    expect(maskPhone("1234")).toBe("**34");
  });

  it("6 цифр — маска + пробел + tail", () => {
    expect(maskPhone("123456")).toBe("**** 56");
  });

  it("префикс 7", () => {
    expect(maskPhone("79001234567")).toBe("+7 *** *** *** 67");
  });

  it("префикс не 7", () => {
    expect(maskPhone("+19991234567")).toContain("+1");
    expect(maskPhone("+19991234567")).toMatch(/\d{2}$/);
  });

  it("1 цифра → ***", () => {
    expect(maskPhone("1")).toBe("***");
  });
});
