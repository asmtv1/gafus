import { describe, expect, it } from "vitest";
import { fields, validDate } from "./petVetVisitDomain";

describe("veterinary visit extracted domain constraints", () => {
  it("keeps the original form field order and limits", () => {
    expect(fields).toEqual([
      ["specialty", "Специальность врача", 200],
      ["doctorName", "ФИО врача", 200],
      ["clinic", "Какая клиника", 300],
      ["diagnosis", "Какой был диагноз", 10000],
      ["conclusion", "Какое было заключение", 10000],
      ["notes", "Ваши заметки", 10000],
    ]);
  });
  it.each(["1900-01-01", "2025-12-31"])("accepts valid past calendar date %s", day => {
    expect(validDate(day)).toBe(true);
  });
  it.each(["1899-12-31", "2025-02-30", "2026-02-29", "2025-00-12", "2025-12-00", "xxx", "2025-1-1", "9999-12-31"])(
    "rejects malformed/future date %s", day => {
      expect(validDate(day)).toBe(false);
    },
  );
});
