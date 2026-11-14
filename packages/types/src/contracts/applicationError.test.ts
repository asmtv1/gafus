import { describe, expect, it } from "vitest";
import {
  APPLICATION_PUBLIC_ERROR_HTTP, APPLICATION_PUBLIC_ERROR_MESSAGE,
  classifyApplicationPublicError, isRetryableApplicationError,
} from "./applicationError";

describe("public Application error contract", () => {
  it("classifies the eight stable public codes and refuses malformed statuses", () => {
    for (const [code, status] of Object.entries(APPLICATION_PUBLIC_ERROR_HTTP)) {
      expect(classifyApplicationPublicError(code, status)).toBe(code);
      expect(classifyApplicationPublicError(code, 500)).toBeNull();
      expect(APPLICATION_PUBLIC_ERROR_MESSAGE[code as keyof typeof APPLICATION_PUBLIC_ERROR_HTTP])
        .not.toContain("SECRET");
    }
    expect(classifyApplicationPublicError("INTERNAL_ERROR", 500)).toBeNull();
    expect(classifyApplicationPublicError("RANDOM_PROVIDER_FAILURE", 503)).toBeNull();
  });

  it("marks only rate limits and unavailable dependencies as retryable", () => {
    for (const code of Object.keys(APPLICATION_PUBLIC_ERROR_HTTP)) {
      expect(isRetryableApplicationError(code)).toBe(
        code === "RATE_LIMITED" || code === "DEPENDENCY_UNAVAILABLE",
      );
    }
    expect(isRetryableApplicationError("INTERNAL_ERROR")).toBe(false);
  });
});
