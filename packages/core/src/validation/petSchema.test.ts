import { describe, expect, it } from "vitest";

import {
  createPetSchema,
  formatIsoBirthDateToDdMmYyyy,
  parsePetBirthDateInput,
  petBellyGirthSchema,
  petHeightSchema,
  petWeightSchema,
} from "./petSchema";

describe("petSchema", () => {
  it("parses supported birth date formats", () => {
    const ruDate = parsePetBirthDateInput("15.03.2020");
    const isoDate = parsePetBirthDateInput("2020-03-15");

    expect(ruDate?.getFullYear()).toBe(2020);
    expect(ruDate?.getMonth()).toBe(2);
    expect(ruDate?.getDate()).toBe(15);
    expect(isoDate?.getFullYear()).toBe(2020);
    expect(isoDate?.getMonth()).toBe(2);
    expect(isoDate?.getDate()).toBe(15);
    expect(parsePetBirthDateInput("31.02.2020")).toBeNull();
  });

  it("formats iso birth date for text inputs", () => {
    expect(formatIsoBirthDateToDdMmYyyy("2020-03-15")).toBe("15.03.2020");
    expect(formatIsoBirthDateToDdMmYyyy("")).toBe("");
  });

  it("validates optional numeric pet measurements", () => {
    expect(petHeightSchema.safeParse("35").success).toBe(true);
    expect(petWeightSchema.safeParse("12.5").success).toBe(true);
    expect(petBellyGirthSchema.safeParse("0").success).toBe(false);
  });

  it("normalizes new pet measurement fields in create schema", () => {
    const parsed = createPetSchema.parse({
      name: "Бимка",
      type: "DOG",
      breed: "Корги",
      birthDate: "15.03.2020",
      heightCm: "35",
      weightKg: "12.5",
      neckGirthCm: "28",
      muzzleGirthCm: "22",
      bellyGirthCm: "54",
      photoUrl: "",
      notes: "спокойный",
    });

    expect(parsed.heightCm).toBe(35);
    expect(parsed.weightKg).toBe(12.5);
    expect(parsed.neckGirthCm).toBe(28);
    expect(parsed.muzzleGirthCm).toBe(22);
    expect(parsed.bellyGirthCm).toBe(54);
    expect(parsed.birthDate).toBe("2020-03-15");
  });
});
