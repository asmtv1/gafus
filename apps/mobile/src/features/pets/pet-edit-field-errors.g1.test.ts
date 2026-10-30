import { describe, it, expect } from "vitest";
import { petEditServerErrors } from "./pet-edit-field-errors";
describe("AG4 stable pet fieldErrors", () => {
  it("maps allowed codes to fixed user-facing strings", () =>
    expect(
      petEditServerErrors({
        code: "PET_VALIDATION_ERROR",
        details: {
          fieldErrors: {
            heightCm: "OUT_OF_RANGE",
            neckGirthCm: "NOT_NULLABLE",
            weightKg: "UNSUPPORTED_FIELD",
          },
        },
      }),
    ).toEqual({
      heightCm: "Значение выходит за допустимые пределы",
      neckGirthCm: "Это поле нельзя очистить",
      weightKg: "Изменение этого поля недоступно",
    }));
  it("does not surface unknown values, private keys or unrelated server errors", () => {
    expect(
      petEditServerErrors({
        code: "REQUEST_TIMEOUT",
        details: { fieldErrors: { heightCm: "OUT_OF_RANGE" } },
      }),
    ).toEqual({});
    expect(
      petEditServerErrors({
        code: "PET_VALIDATION_ERROR",
        details: { fieldErrors: { heightCm: "X-Amz-Signature=PRIVATE", email: "private@example" } },
      }),
    ).toEqual({});
  });
});
