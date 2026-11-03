import { describe, expect, it } from "vitest";
import { matchLegacyPath } from "../routes";
import {
  toTrainerBrowserHref,
  toTrainerBrowserPath,
  toTrainerLegacyPath,
} from "./trainerBrowserRoutes";

describe("trainer Vite canonical browser URLs", () => {
  it.each([
    ["/main-panel", "/"],
    ["/main-panel/statistics", "/statistics"],
    ["/main-panel/steps", "/steps"],
    ["/main-panel/courses/new", "/courses/new"],
    ["/main-panel/daily-course/steps", "/daily-course/steps"],
    ["/main-panel/consultations/call/booking-123", "/consultations/call/booking-123"],
    ["/main-panel/courses/course-22/edit", "/courses/course-22/edit"],
  ])("round-trips valid legacy URL %s as %s", (legacy, short) => {
    expect(toTrainerBrowserPath(legacy)).toBe(short);
    expect(toTrainerLegacyPath(short)).toBe(legacy);
    expect(matchLegacyPath(toTrainerLegacyPath(short))).not.toBeNull();
  });

  it("preserves query strings and doesn't accidentally prefix nested content", () => {
    expect(toTrainerBrowserHref(
      "/main-panel/exam-results?hideCompleted=true",
    )).toBe("/exam-results?hideCompleted=true");
    expect(toTrainerBrowserHref(
      "/main-panel/daily-course/steps?orderBy=createdAt&order=desc&rowsPerPage=25",
    )).toBe("/daily-course/steps?orderBy=createdAt&order=desc&rowsPerPage=25");
  });

  it.each([
    "/login",
    "/api/v1/auth/me",
    "/main-panel-evil",
    "/main-panel/unknown",
    "//evil.example",
    "/main-panel/courses/%2F/edit",
    "/main-panel/courses/../edit",
  ])("does not rewrite invalid or unrelated path %s", (pathname) => {
    expect(toTrainerBrowserPath(pathname)).toBe(pathname);
  });

  it.each([
    "/unknown",
    "/api/v1/auth/me",
    "//evil.example",
    "/courses/%2F/edit",
    "/main-panel-evil",
  ])("does not grant an unknown route through path conversion %s", (pathname) => {
    expect(matchLegacyPath(toTrainerLegacyPath(pathname))).toBeNull();
  });

  it("does not reintroduce the removed FAQ route", () => {
    expect(matchLegacyPath("/main-panel/faq")).toBeNull();
    expect(toTrainerLegacyPath("/faq")).toBe("/faq");
    expect(toTrainerBrowserPath("/main-panel/faq")).toBe("/main-panel/faq");
  });

  it("keeps explicit login and legacy URLs accepted", () => {
    expect(toTrainerLegacyPath("/login")).toBe("/login");
    expect(toTrainerLegacyPath("/main-panel/steps")).toBe("/main-panel/steps");
  });
});
