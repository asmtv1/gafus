import { beforeAll, describe, expect, it } from "vitest";
import type * as UsernameContract from "./usernameAvailability";
import type { normalizeUsernameAvailabilityInput as NormalizeUsername } from "../utils/validation";

// The normal project Vitest suite includes src/**/*.test.ts. Import the
// published browser-safe root *after* Types build, without a static self-import
// that breaks a clean DTS emit, and without resolving old adjacent .js files.
let isValidUsernameAvailabilityQuery: typeof UsernameContract.isValidUsernameAvailabilityQuery;
let parseUsernameAvailabilityData: typeof UsernameContract.parseUsernameAvailabilityData;
let parseUsernameAvailabilitySuccess: typeof UsernameContract.parseUsernameAvailabilitySuccess;
let normalizeUsernameAvailabilityInput: typeof NormalizeUsername;
beforeAll(async () => {
  const publishedEntrypoint = "@gafus/types";
  const runtime = await import(/* @vite-ignore */ publishedEntrypoint);
  isValidUsernameAvailabilityQuery = runtime.isValidUsernameAvailabilityQuery;
  parseUsernameAvailabilityData = runtime.parseUsernameAvailabilityData;
  parseUsernameAvailabilitySuccess = runtime.parseUsernameAvailabilitySuccess;
  normalizeUsernameAvailabilityInput = runtime.normalizeUsernameAvailabilityInput;
});

describe("username availability shared DTO", () => {
  it.each(["abc", "A_1", "x".repeat(50)])("valid query %s", name =>
    expect(isValidUsernameAvailabilityQuery(name)).toBe(true));
  it.each(["ab", "x".repeat(51), "user-hyphen", "привет", 42, null])("invalid query %s", name =>
    expect(isValidUsernameAvailabilityQuery(name)).toBe(false));
  it.each([true, false])("preserves boolean %s", available => {
    expect(parseUsernameAvailabilityData({ available })).toEqual({ available });
    expect(parseUsernameAvailabilitySuccess({ success: true, data: { available } })).toEqual({
      success: true, data: { available },
    });
  });
  it.each([{available:"true"},{available:1},{available:null},{},null,[]])(
    "rejects malformed success %j", data => {
      expect(parseUsernameAvailabilityData(data)).toBeNull();
      expect(parseUsernameAvailabilitySuccess({success:true,data})).toBeNull();
    });
  it.each([
    ["  Ab_1  ", "Ab_1", "ab_1"],
    [" " + "X".repeat(50) + " ", "X".repeat(50), "x".repeat(50)],
    ["  ab  ", null, null],
    ["u-2", null, null],
    ["пользователь", null, null],
  ])("shared wire/canonical normalization %j", (wire, serverExpected, webExpected) => {
    expect(normalizeUsernameAvailabilityInput(wire)).toBe(serverExpected);
    expect(normalizeUsernameAvailabilityInput(wire, true)).toBe(webExpected);
  });
  it.each([
    ["  A_1  ", "A_1", true],
    ["  ab  ", "ab", false],
    ["  " + "x".repeat(50) + "  ", "x".repeat(50), true],
    ["  " + "x".repeat(51) + "  ", "x".repeat(51), false],
    ["éuser", "éuser", false],
    ["first-name", "first-name", false],
    ["a\nb", "a\nb", false],
  ])("normalized query syntax (Hono trims, Web canonicalizes) %j", (_wire, normalized, accepted) => {
    expect(isValidUsernameAvailabilityQuery(normalized)).toBe(accepted);
  });
  it("accepts compatible forward additions but never malformed booleans or error-shaped success", () => {
    expect(parseUsernameAvailabilitySuccess({
      success: true, data: { available: false, futureField: { arbitrary: "ignored" } }, trace: "new",
    })).toEqual({ success: true, data: { available: false } });
    expect(parseUsernameAvailabilityData({ available: true, futureBoolean: "ignored" }))
      .toEqual({ available: true });
    // Malformed available and a success envelope with an error must fail
    // closed, even when the stray payload itself contains a true boolean.
    for (const value of [
      { success: true, data: { available: "false" } },
      { success: true, data: { available: 1 } },
      { success: true, data: { available: true }, error: "unexpected" },
      { success: false, data: { available: true } },
    ]) expect(parseUsernameAvailabilitySuccess(value)).toBeNull();
    // Forward-compatible unknown nested fields are harmless.
    expect(parseUsernameAvailabilitySuccess({
      success: true, data: { available: true, error: "future unrelated field" },
    })).toEqual({ success: true, data: { available: true } });
  });
  it("rejects error envelope with truthy data", () =>
    expect(parseUsernameAvailabilitySuccess({success:false,data:{available:true}})).toBeNull());
});
