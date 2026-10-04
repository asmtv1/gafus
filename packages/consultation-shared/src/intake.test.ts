import { describe, expect, it } from "vitest";
import {
  cynologistIntakeSchema,
  formatCynologistIntake,
  INTAKE_FIELDS,
  storedCynologistIntakeSchema,
} from "./intake";
const intake = {
  clientOwnerName: "Анна",
  clientPhone: "+79991234567",
  petName: "Боб",
  petGender: "MALE",
  petAge: "2 года",
  petBreed: "Метис",
  clientProblem: "Собака тянет поводок",
  clientProblemDuration: "Около месяца",
  clientSelfHelpAttempt: "Пока ничего",
};
describe("shared intake", () => {
  it("requires duration on new forms but reads older saved forms", () => {
    const { clientProblemDuration, ...legacy } = intake;
    expect(cynologistIntakeSchema.safeParse(legacy).success).toBe(false);
    expect(storedCynologistIntakeSchema.parse(legacy).clientProblemDuration).toBe("Не указано");
    expect(
      cynologistIntakeSchema.safeParse({ ...intake, clientProblemDuration: "   " }).success,
    ).toBe(false);
  });
  it("requires each of the nine fields", () => {
    for (const [key] of INTAKE_FIELDS)
      expect(cynologistIntakeSchema.safeParse({ ...intake, [key]: "" }).success).toBe(false);
  });
  it("includes every label and value in the first message", () => {
    const value = cynologistIntakeSchema.parse(intake);
    const text = formatCynologistIntake(value);
    for (const [, label] of INTAKE_FIELDS) expect(text).toContain(`${label}:`);
    expect(text).toContain("Мальчик");
    expect(text).toContain("Как давно появилась проблема?: Около месяца");
  });
});
