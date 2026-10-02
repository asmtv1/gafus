import { describe, expect, it } from "vitest";
import { cynologistIntakeSchema, formatCynologistIntake, INTAKE_FIELDS } from "./intake";
const intake = { clientOwnerName: "Анна", clientPhone: "+79991234567", petName: "Боб", petGender: "MALE", petAge: "2 года", petBreed: "Метис", clientProblem: "Собака тянет поводок", clientSelfHelpAttempt: "Пока ничего" };
describe("shared intake", () => {
  it("requires each of the eight fields", () => { for (const [key] of INTAKE_FIELDS) expect(cynologistIntakeSchema.safeParse({ ...intake, [key]: "" }).success).toBe(false); });
  it("includes every label and value in the first message", () => { const value = cynologistIntakeSchema.parse(intake); const text = formatCynologistIntake(value); for (const [, label] of INTAKE_FIELDS) expect(text).toContain(`${label}:`); expect(text).toContain("Мальчик"); });
});
