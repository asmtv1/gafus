import { describe, expect, it } from "vitest";
import { parseVetVisitDate } from "./vetVisitDate";

const today = new Date(2026, 9, 17, 12, 0, 0);

describe("AG3-PROFILE-031 veterinary visit calendar validation", () => {
  it.each([
    ["17.10.2026", "2026-10-17"],
    ["16.10.2026", "2026-10-16"],
    ["29.02.2024", "2024-02-29"],
    ["01.03.2024", "2024-03-01"],
  ])("accepts real current or past calendar dates %s", (input, expected) => {
    expect(parseVetVisitDate(input, today)).toBe(expected);
  });

  it.each([
    "31.02.2026",
    "29.02.2025",
    "31.04.2026",
    "00.10.2026",
    "10.00.2026",
    "31.13.2026",
    "00.00.2026",
  ])("rejects impossible calendar date %s", (input) => {
    expect(parseVetVisitDate(input, today)).toBeNull();
  });

  it.each(["18.10.2026", "01.11.2026", "18.10.2027"])("rejects future visit date %s", (input) => {
    expect(parseVetVisitDate(input, today)).toBeNull();
  });

  it.each([
    "2026-10-17",
    "17/10/2026",
    "1.10.2026",
    "17.1.2026",
    "17.10.26",
    "",
    "17.10.2026extra",
  ])("rejects malformed visit date %s", (input) => {
    expect(parseVetVisitDate(input, today)).toBeNull();
  });

  it("uses the local calendar day rather than a UTC day rollover", () => {
    const lateToday = new Date(2026, 9, 17, 23, 55, 0);
    expect(parseVetVisitDate("17.10.2026", lateToday)).toBe("2026-10-17");
    expect(parseVetVisitDate("18.10.2026", lateToday)).toBeNull();
  });
});
