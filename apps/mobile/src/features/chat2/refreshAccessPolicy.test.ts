import { describe, expect, it } from "vitest";
import { isTerminalChat2RefreshFailure } from "./refreshAccessPolicy";

describe("Chat2 native subscription refresh", () => {
  it.each([
    "COURSE_ACCESS_REQUIRED", "NOT_FOUND", "FORBIDDEN", "BLOCKED",
    "G05_SESSION_CHANGED", "NO_REFRESH_TOKEN", "REFRESH_REJECTED", "REGISTRATION_PENDING",
  ])("permanently stops retrying after %s", (code) => {
    expect(isTerminalChat2RefreshFailure(code)).toBe(true);
  });
  it.each(["NETWORK_ERROR", "REQUEST_TIMEOUT", "AUTH_REFRESH_UNAVAILABLE", "RATE_LIMITED", "INTERNAL", undefined])(
    "keeps the room retryable after %s", (code) => {
      expect(isTerminalChat2RefreshFailure(code)).toBe(false);
    },
  );
});
