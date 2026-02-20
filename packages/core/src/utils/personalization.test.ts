import { describe, expect, it, vi } from "vitest";

import {
  declineRussianName,
  replacePersonalizationPlaceholders,
  type PersonalizationData,
} from "./personalization";

const mockPetrovich = vi.hoisted(() =>
  vi.fn((person: { first: string }, caseName: string) => {
    if (caseName === "genitive") return { first: `${person.first}а` };
    if (caseName === "dative") return { first: `${person.first}у` };
    if (caseName === "accusative") return { first: `${person.first}а` };
    if (caseName === "instrumental") return { first: `${person.first}ом` };
    if (caseName === "prepositional") return { first: `${person.first}е` };
    return { first: person.first };
  }),
);

vi.mock("petrovich", () => ({ default: mockPetrovich }));

describe("declineRussianName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty object for empty string", () => {
    const result = declineRussianName("");
    expect(result).toEqual({
      nominative: "",
      genitive: "",
      dative: "",
      accusative: "",
      instrumental: "",
      prepositional: "",
    });
    expect(mockPetrovich).not.toHaveBeenCalled();
  });

  it("returns empty object for whitespace-only", () => {
    const result = declineRussianName("   ");
    expect(result.nominative).toBe("");
  });

  it("returns DeclinedName with nominative = input", () => {
    const result = declineRussianName("Иван");
    expect(result.nominative).toBe("Иван");
  });

  it("calls petrovich for each case with male gender", () => {
    declineRussianName("Иван", "male");
    expect(mockPetrovich).toHaveBeenCalledWith(
      { gender: "male", first: "Иван" },
      "genitive",
    );
    expect(mockPetrovich).toHaveBeenCalledWith(
      { gender: "male", first: "Иван" },
      "dative",
    );
  });

  it("uses androgynous when gender omitted", () => {
    declineRussianName("Саша");
    expect(mockPetrovich).toHaveBeenCalledWith(
      expect.objectContaining({ gender: "androgynous" }),
      expect.any(String),
    );
  });

  it("returns fallback to input when petrovich throws", () => {
    mockPetrovich.mockImplementationOnce(() => {
      throw new Error("petrovich error");
    });
    const result = declineRussianName("Иван");
    expect(result.genitive).toBe("Иван");
    expect(result.dative).toBe("Иван");
  });
});

describe("replacePersonalizationPlaceholders", () => {
  const basePersonalization: PersonalizationData = {
    userDisplayName: "Иван",
    userGender: "male",
    petName: "Бобик",
    petGender: "male",
  };

  beforeEach(() => {
    mockPetrovich.mockImplementation((person: { first: string }, caseName: string) => {
      const suffix: Record<string, string> = {
        genitive: "а",
        dative: "у",
        accusative: "а",
        instrumental: "ом",
        prepositional: "е",
      };
      return { first: person.first + (suffix[caseName] ?? "") };
    });
    vi.clearAllMocks();
  });

  it("replaces {{userName}} with user name", () => {
    const result = replacePersonalizationPlaceholders(
      "Привет, {{userName}}!",
      basePersonalization,
    );
    expect(result).toBe("Привет, Иван!");
  });

  it("replaces {{petName}} with pet name", () => {
    const result = replacePersonalizationPlaceholders(
      "Питомец: {{petName}}",
      basePersonalization,
    );
    expect(result).toBe("Питомец: Бобик");
  });

  it("replaces {{userNameGen}} with genitive", () => {
    const result = replacePersonalizationPlaceholders(
      "Курс для {{userNameGen}}",
      basePersonalization,
    );
    expect(result).toContain("Ивана");
  });

  it("replaces multiple placeholders", () => {
    const result = replacePersonalizationPlaceholders(
      "{{userName}} и {{petName}}",
      basePersonalization,
    );
    expect(result).toBe("Иван и Бобик");
  });

  it("returns unchanged text when no placeholders", () => {
    const text = "Простой текст без плейсхолдеров";
    const result = replacePersonalizationPlaceholders(text, basePersonalization);
    expect(result).toBe(text);
  });

  it("replaces userGenderPronoun: male vs female", () => {
    const maleResult = replacePersonalizationPlaceholders(
      "{{userGenderPronoun:Он|Она}} занят",
      basePersonalization,
    );
    expect(maleResult).toBe("Он занят");

    const femaleResult = replacePersonalizationPlaceholders(
      "{{userGenderPronoun:Он|Она}} занята",
      { ...basePersonalization, userGender: "female" },
    );
    expect(femaleResult).toBe("Она занята");
  });

  it("replaces petGenderPronoun", () => {
    const result = replacePersonalizationPlaceholders(
      "{{petGenderPronoun:Он|Она}} дома",
      basePersonalization,
    );
    expect(result).toBe("Он дома");
  });

  it("uses provided petNameGen when present", () => {
    const result = replacePersonalizationPlaceholders(
      "Любимец {{petNameGen}}",
      { ...basePersonalization, petNameGen: "Бобика" },
    );
    expect(result).toBe("Любимец Бобика");
  });

  it("replaces userGenderAdj placeholder", () => {
    const result = replacePersonalizationPlaceholders(
      "Ты {{userGenderAdj:серьёзен|серьёзна}}",
      basePersonalization,
    );
    expect(result).toBe("Ты серьёзен");
    const femaleResult = replacePersonalizationPlaceholders(
      "Ты {{userGenderAdj:серьёзен|серьёзна}}",
      { ...basePersonalization, userGender: "female" },
    );
    expect(femaleResult).toBe("Ты серьёзна");
  });

  it("replaces userGenderVerb placeholder", () => {
    const result = replacePersonalizationPlaceholders(
      "{{userGenderVerb:ждал|ждала}} тебя",
      basePersonalization,
    );
    expect(result).toBe("ждал тебя");
  });

  it("replaces petGender with null as male", () => {
    const result = replacePersonalizationPlaceholders(
      "{{petGenderPronoun:Он|Она}} спит",
      { ...basePersonalization, petGender: null },
    );
    expect(result).toBe("Он спит");
  });
});
