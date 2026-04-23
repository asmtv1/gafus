import { describe, expect, it } from "vitest";

import {
  formatRuPhoneForDisplay,
  isLikelyValidRuPhoneInput,
  normalizeRuPhoneForStorage,
} from "./ruPhone";

describe("ruPhone (booking, libphonenumber)", () => {
  it("нормализует РФ без +", () => {
    expect(normalizeRuPhoneForStorage("89001234567")).toBe("+79001234567");
    expect(normalizeRuPhoneForStorage("9001234567")).toBe("+79001234567");
  });

  it("принимает международные E.164", () => {
    expect(normalizeRuPhoneForStorage("+375291234567")).toBe("+375291234567");
    expect(normalizeRuPhoneForStorage("+998901234567")).toBe("+998901234567");
    expect(normalizeRuPhoneForStorage("+77011234567")).toBe("+77011234567");
    expect(normalizeRuPhoneForStorage("+12025550123")).toBe("+12025550123");
  });

  it("принимает +39… (возможный по длине, даже если не isValid в национальном плане)", () => {
    expect(normalizeRuPhoneForStorage("+39198031379")).toBe("+39198031379");
  });

  it("отсекает мусор", () => {
    expect(normalizeRuPhoneForStorage("")).toBeNull();
    expect(normalizeRuPhoneForStorage("abc")).toBeNull();
  });

  it("isLikelyValidRuPhoneInput согласован с нормализацией", () => {
    expect(isLikelyValidRuPhoneInput("+375291234567")).toBe(true);
    expect(isLikelyValidRuPhoneInput("abc")).toBe(false);
  });

  it("formatRuPhoneForDisplay: intl-формат для E.164", () => {
    expect(formatRuPhoneForDisplay("+79001234567")).toMatch(/\+7/);
    expect(formatRuPhoneForDisplay(null)).toBe("—");
  });
});
