import { describe, expect, it } from "vitest";

import { isAppUpdateRequired } from "./app-version";

describe("isAppUpdateRequired", () => {
  it.each([
    ["1.5.4", "1.5.5"],
    ["1.4.99", "1.5.5"],
    ["0.99.99", "1.0.0"],
  ])("requires an update for %s below %s", (current, minimum) => {
    expect(isAppUpdateRequired(current, minimum)).toBe(true);
  });

  it.each([
    ["1.5.5", "1.5.5"],
    ["1.5.6", "1.5.5"],
    ["2.0.0", "1.5.5"],
  ])("does not block %s when the minimum is %s", (current, minimum) => {
    expect(isAppUpdateRequired(current, minimum)).toBe(false);
  });

  it.each([
    ["unknown", "1.5.5"],
    ["1.5.5", "latest"],
    ["", "1.5.5"],
  ])("fails open for invalid values %s and %s", (current, minimum) => {
    expect(isAppUpdateRequired(current, minimum)).toBe(false);
  });
});
