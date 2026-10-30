import { describe, expect, it } from "vitest";
import { defaultMobileDateFilter, mobileIntroFilterFromSearch, mobileIntroReportUrl, mobileIntroRouteUrl } from "./MobileIntroPanel";

describe("legacy Next mobile intro date parity", () => {
  it("defaults to last 30 Samara calendar days", () => {
    expect(defaultMobileDateFilter(new Date("2026-10-25T02:30:00Z"))).toEqual({
      startDate: "2026-09-26",
      endDate: "2026-10-25",
    });
  });
  it("preserves Samara UTC+04 half-open interval, including the last date", () => {
    const url = mobileIntroReportUrl({ startDate: "2026-10-01", endDate: "2026-10-25" });
    const target = new URL(url, "http://localhost");
    expect(target.pathname).toBe("/api/v1/mobile-intro/admin/report");
    expect(target.searchParams.get("start")).toBe("2026-09-30T20:00:00.000Z");
    expect(target.searchParams.get("end")).toBe("2026-10-25T20:00:00.000Z");
  });
  it("restores Next report dates from shareable Vite URL", () => {
    const filter = mobileIntroFilterFromSearch("?start=2026-10-03&end=2026-10-15");
    expect(filter).toEqual({ startDate: "2026-10-03", endDate: "2026-10-15" });
    expect(mobileIntroRouteUrl(filter)).toBe("/main-panel/mobile-intro?start=2026-10-03&end=2026-10-15");
  });
  it("rejects malformed or partial report dates like the historic Next page", () => {
    const now = new Date("2026-10-25T02:30:00Z");
    expect(mobileIntroFilterFromSearch("?start=2026-02-30&end=2026-10-25", now)).toEqual(
      defaultMobileDateFilter(now),
    );
    expect(mobileIntroFilterFromSearch("?start=2026-10-03", now)).toEqual(
      defaultMobileDateFilter(now),
    );
    expect(mobileIntroFilterFromSearch("?start=2026-10-25&end=2026-10-03", now)).toEqual(
      defaultMobileDateFilter(now),
    );
    expect(() => mobileIntroRouteUrl({ startDate: "2026-02-30", endDate: "2026-10-25" }))
      .toThrow("Некорректный период");
  });
  it("single calendar day means 24 hours, not zero or 48", () => {
    const url = new URL(
      mobileIntroReportUrl({
        startDate: "2026-10-25",
        endDate: "2026-10-25",
      }),
      "http://localhost",
    );
    const diff =
      new Date(url.searchParams.get("end")!).getTime() -
      new Date(url.searchParams.get("start")!).getTime();
    expect(diff).toBe(86400000);
  });
  it.each([
    { startDate: "2026-10-26", endDate: "2026-10-25" },
    { startDate: "2026-02-30", endDate: "2026-03-01" },
    { startDate: "../../secret", endDate: "2026-10-25" },
  ])("rejects invalid or reversed dates instead of silently using defaults", (filter) => {
    expect(() => mobileIntroReportUrl(filter)).toThrow("Некорректный период");
  });
});
