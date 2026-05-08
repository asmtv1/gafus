import { describe, expect, it } from "vitest";

import { validatePetForm } from "./pet-form-validation";

describe("validatePetForm", () => {
  it("returns field errors for empty required fields", () => {
    const result = validatePetForm({
      name: "",
      breed: " ",
      birthDate: "",
      heightCm: "",
      weightKg: "",
      neckGirthCm: "",
      muzzleGirthCm: "",
      bellyGirthCm: "",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual({
        name: "Введите кличку питомца",
        breed: "Укажите породу питомца",
        birthDate: "Дата рождения обязательна",
      });
    }
  });

  it("returns field errors for invalid date and optional numeric fields", () => {
    const result = validatePetForm({
      name: "Бим",
      breed: "Корги",
      birthDate: "45.13.2020",
      heightCm: "0",
      weightKg: "300",
      neckGirthCm: "0",
      muzzleGirthCm: "250",
      bellyGirthCm: "oops",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.birthDate).toBe("Укажите дату как ДД.ММ.ГГГГ (например, 15.03.2020)");
      expect(result.errors.heightCm).toBe("Рост должен быть от 1 до 200 см");
      expect(result.errors.weightKg).toBe("Вес должен быть от 0.1 до 200 кг");
      expect(result.errors.neckGirthCm).toBe("Обхват шеи должен быть от 1 до 200 см");
      expect(result.errors.muzzleGirthCm).toBe("Обхват морды должен быть от 1 до 200 см");
      expect(result.errors.bellyGirthCm).toBe("Обхват живота должен быть от 1 до 200 см");
    }
  });

  it("returns normalized values for valid form input", () => {
    const result = validatePetForm({
      name: " Бим ",
      breed: " Корги ",
      birthDate: "15.03.2020",
      heightCm: "35",
      weightKg: "12.5",
      neckGirthCm: "28",
      muzzleGirthCm: "22",
      bellyGirthCm: "54",
    });

    expect(result).toEqual({
      ok: true,
      values: {
        name: "Бим",
        breed: "Корги",
        birthDate: "2020-03-15",
        heightCm: 35,
        weightKg: 12.5,
        neckGirthCm: 28,
        muzzleGirthCm: 22,
        bellyGirthCm: 54,
      },
    });
  });
});
