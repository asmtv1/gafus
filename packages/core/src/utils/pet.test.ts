import { describe, expect, it } from "vitest";

import { getPetTypeLabel } from "./pet";

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
