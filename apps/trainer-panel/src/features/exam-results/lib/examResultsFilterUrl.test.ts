import { describe, expect, it } from "vitest";

import { buildExamResultsFilterUrl } from "./examResultsFilterUrl";

describe("buildExamResultsFilterUrl", () => {
  it("keeps hideCompleted=false explicit because the page default is true", () => {
    expect(
      buildExamResultsFilterUrl({
        currentSearch: "hideCompleted=true",
        hideCompleted: false,
      }),
    ).toBe("?hideCompleted=false");
  });

  it("returns null when the current URL already matches the requested filter", () => {
    expect(
      buildExamResultsFilterUrl({
        currentSearch: "hideCompleted=false",
        hideCompleted: false,
      }),
    ).toBeNull();
  });
});
