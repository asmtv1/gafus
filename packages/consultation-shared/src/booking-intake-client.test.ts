import { describe, expect, it } from "vitest";
import {
  isBookingIntakeValid,
  isOwnerOrPetName,
  isProblemField,
  isSelfHelpField,
} from "./booking-intake-client";

const valid = {
  clientOwnerName: "Анна",
  clientPhone: "+79999999999",
  petName: "Рекс",
  petGender: "MALE" as const,
  petAge: "2 года",
  petBreed: "метис",
  clientProblem: "Проблема поведения у собаки",
  clientSelfHelpAttempt: "Работали с кинологом",
  phoneOk: (value: string) => value.startsWith("+7"),
};

describe("shared consultation booking validation", () => {
  it("accepts valid Web/Mobile form", () => {
    expect(isBookingIntakeValid(valid)).toBe(true);
  });
  it("requires valid name length", () => {
    expect(isOwnerOrPetName(" A ")).toBe(false);
    expect(isOwnerOrPetName("  Анна ")).toBe(true);
    expect(isBookingIntakeValid({ ...valid, petName: "X" })).toBe(false);
  });
  it("enforces problem and self-help limits", () => {
    expect(isProblemField("коротко")).toBe(false);
    expect(isSelfHelpField(" ")).toBe(false);
    expect(isBookingIntakeValid({ ...valid, clientProblem: "кратко" })).toBe(false);
  });
  it("requires gender, breed, age and phone", () => {
    expect(isBookingIntakeValid({ ...valid, petGender: "" })).toBe(false);
    expect(isBookingIntakeValid({ ...valid, petBreed: "" })).toBe(false);
    expect(isBookingIntakeValid({ ...valid, petAge: " " })).toBe(false);
    expect(isBookingIntakeValid({ ...valid, clientPhone: "000" })).toBe(false);
  });
});
