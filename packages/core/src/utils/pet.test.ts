import { afterEach, describe, expect, it, vi } from "vitest";

import { formatPetAge, getPetTypeLabel } from "./pet";

describe("getPetTypeLabel", () => {
  it("returns Собака for DOG", () => {
    expect(getPetTypeLabel("DOG")).toBe("Собака");
  });

  it("returns Кошка for CAT", () => {
    expect(getPetTypeLabel("CAT")).toBe("Кошка");
  });

  it("returns input as-is for unknown type", () => {
    expect(getPetTypeLabel("BIRD")).toBe("BIRD");
  });

  it("returns empty string for empty input", () => {
    expect(getPetTypeLabel("")).toBe("");
  });
});


describe("formatPetAge", () => {
  afterEach(() => vi.useRealTimers());
  it("uses complete months and the same Russian label for Date and JSON dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
    expect(formatPetAge("2020-10-11")).toBe("5 лет 11 месяцев");
    expect(formatPetAge(new Date("2020-10-10"))).toBe("6 лет");
    expect(formatPetAge("2026-10-01")).toBe("Меньше месяца");
    expect(formatPetAge(null)).toBeNull();
    expect(formatPetAge("invalid")).toBeNull();
    expect(formatPetAge("2027-01-01")).toBeNull();
  });
});
