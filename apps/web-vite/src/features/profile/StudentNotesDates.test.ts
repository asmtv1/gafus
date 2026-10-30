import { describe, expect, it } from "vitest";
import { notesDate } from "./StudentNotesPanel";

describe("WEB1 StudentNotes matches Next localized viewer dates", () => {
  it("renders the ISO timestamp in the local timezone instead of forcing Moscow", () => {
    const old = process.env.TZ;
    try {
      process.env.TZ = "Europe/Paris";
      expect(notesDate("2026-10-25T00:30:00.000Z", true)).toContain("02:30");
      process.env.TZ = "Europe/Moscow";
      expect(notesDate("2026-10-25T00:30:00.000Z", true)).toContain("03:30");
    } finally {
      if (old === undefined) delete process.env.TZ;
      else process.env.TZ = old;
    }
  });
  it("matches exact original date-fns Russian punctuation and genitive month", () => {
    const previous = process.env.TZ;
    try {
      process.env.TZ="Europe/Moscow";
      expect(notesDate("2026-10-25T00:30:00.000Z")).toBe("25 октября 2026");
      expect(notesDate("2026-10-25T00:30:00.000Z",true)).toBe("25 октября 2026, 03:30");
      expect(notesDate("2026-10-25T00:30:00.000Z",true)).not.toContain("г.");
    } finally {
      if(previous===undefined)delete process.env.TZ;
      else process.env.TZ=previous;
    }
  });
  it("does not render invalid dates", () => {
    expect(notesDate("invalid-date")).toBe("");
  });
});
