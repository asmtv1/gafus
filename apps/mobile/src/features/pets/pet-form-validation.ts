import {
  petBellyGirthSchema,
  petHeightSchema,
  petMuzzleGirthSchema,
  petNeckGirthSchema,
  petWeightSchema,
  validatePetBirthDateInput,
} from "@gafus/core/validation/pet";

export type PetFormValues = {
  name: string;
  breed: string;
  birthDate: string;
  heightCm?: string;
  weightKg?: string;
  neckGirthCm?: string;
  muzzleGirthCm?: string;
  bellyGirthCm?: string;
};

export type PetFormErrors = Partial<Record<keyof PetFormValues, string>>;

export type ValidPetFormValues = {
  name: string;
  breed: string;
  birthDate: string;
  heightCm?: number;
  weightKg?: number;
  neckGirthCm?: number;
  muzzleGirthCm?: number;
  bellyGirthCm?: number;
};

function parseOptionalField(
  schema:
    | typeof petHeightSchema
    | typeof petWeightSchema
    | typeof petNeckGirthSchema
    | typeof petMuzzleGirthSchema
    | typeof petBellyGirthSchema,
  raw: string | undefined,
): { ok: true; value: number | undefined } | { ok: false; message: string } {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Поле заполнено некорректно",
    };
  }
  return { ok: true, value: parsed.data };
}

export function validatePetForm(
  values: PetFormValues,
): { ok: true; values: ValidPetFormValues } | { ok: false; errors: PetFormErrors } {
  const errors: PetFormErrors = {};
  const name = values.name.trim();
  const breed = values.breed.trim();

  if (!name) {
    errors.name = "Введите кличку питомца";
  }

  if (!breed) {
    errors.breed = "Укажите породу питомца";
  }

  const birthCheck = validatePetBirthDateInput(values.birthDate);
  let birthDateApiValue: string | undefined;
  if (!birthCheck.ok) {
    errors.birthDate = birthCheck.message;
  } else {
    birthDateApiValue = birthCheck.apiValue;
  }

  const height = parseOptionalField(petHeightSchema, values.heightCm);
  const weight = parseOptionalField(petWeightSchema, values.weightKg);
  const neckGirth = parseOptionalField(petNeckGirthSchema, values.neckGirthCm);
  const muzzleGirth = parseOptionalField(petMuzzleGirthSchema, values.muzzleGirthCm);
  const bellyGirth = parseOptionalField(petBellyGirthSchema, values.bellyGirthCm);

  if (!height.ok) {
    errors.heightCm = height.message;
  }

  if (!weight.ok) {
    errors.weightKg = weight.message;
  }

  if (!neckGirth.ok) {
    errors.neckGirthCm = neckGirth.message;
  }

  if (!muzzleGirth.ok) {
    errors.muzzleGirthCm = muzzleGirth.message;
  }

  if (!bellyGirth.ok) {
    errors.bellyGirthCm = bellyGirth.message;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  if (!birthDateApiValue) {
    return { ok: false, errors: { birthDate: "Дата рождения обязательна" } };
  }

  const heightValue = height.ok ? height.value : undefined;
  const weightValue = weight.ok ? weight.value : undefined;
  const neckGirthValue = neckGirth.ok ? neckGirth.value : undefined;
  const muzzleGirthValue = muzzleGirth.ok ? muzzleGirth.value : undefined;
  const bellyGirthValue = bellyGirth.ok ? bellyGirth.value : undefined;

  return {
    ok: true,
    values: {
      name,
      breed,
      birthDate: birthDateApiValue,
      heightCm: heightValue,
      weightKg: weightValue,
      neckGirthCm: neckGirthValue,
      muzzleGirthCm: muzzleGirthValue,
      bellyGirthCm: bellyGirthValue,
    },
  };
}
