import { describe, expect, it } from "vitest";
import {
  getMoscowDateKey, dateKeyToDate, toDateKey,
  getTodayDate, cleanDailyCourseMarkdownDescription,
} from "./dailyCoursePure";
describe("DailyCourse stable pure date/markdown contracts", () => {
  it("rolls Moscow day over at midnight despite host timezone", () => {
    expect(getMoscowDateKey(new Date("2026-05-02T20:59:59Z"))).toBe("2026-05-02");
    expect(getMoscowDateKey(new Date("2026-05-02T21:00:00Z"))).toBe("2026-05-03");
  });
  it("converts valid date keys to UTC midnight and preserves roundtrip", () => {
    expect(dateKeyToDate("2026-05-02").toISOString()).toBe("2026-05-02T00:00:00.000Z");
    expect(toDateKey(dateKeyToDate("2026-05-02"))).toBe("2026-05-02");
    expect(() => dateKeyToDate("2026/05/02")).toThrow("INVALID_DATE");
    expect(getTodayDate()).toBeInstanceOf(Date);
  });
  it("unwraps fenced or quoted content without rewriting normal Markdown", () => {
    expect(cleanDailyCourseMarkdownDescription("```md\n# Test\n``` ")).toBe("# Test");
    expect(cleanDailyCourseMarkdownDescription("'# hi'")).toBe("'# hi'");
    expect(cleanDailyCourseMarkdownDescription("   normal text  ")).toBe("   normal text  ");
  });
});
